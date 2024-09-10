//! Provides the core functionality for a better typescript experience.

import { Observable, UnaryFunction, catchError, map, of, pipe } from "rxjs";
import { log } from "../public-api";

export interface ResItem<T = any> {
    is_ok(): this is OkCls<T>;
    is_err(): this is ErrCls;
    get ok(): T | undefined;
    get err(): ErrCls | undefined;
    unwrap(): T;
}

export function Ok<T>(val: T): OkCls<T> {
    return new OkCls(val);
}

export function Err(msg?: string, code?: string): ErrCls {
    return new ErrCls(msg, code);
}

export function ErrFromNative(err: Error): ErrCls {
    return ErrCls.from_native(err);
}

export class OkCls<T> implements ResItem<T> {
    private val: T;

    public constructor(val: T) {
        this.val = val;
    }

    public is_ok(): this is OkCls<T> {
        return true;
    }

    public is_err(): this is ErrCls {
        return false;
    }

    public get ok(): T {
        return this.val;
    }

    public get err(): undefined {
        return;
    }

    public unwrap(): T {
        return this.val;
    }
}

// TODO: support stacktrace
export class ErrCls extends Error implements ResItem {
    code: string;
    msg: string | undefined;

    public constructor(msg?: string, code: string = ecode.Err) {
        super();
        this.code = code;
        this.msg = msg;
    }

    public display() {
        if (this.msg === undefined) {
            return this.code;
        }
        return `${this.code}:: ${this.msg}`;
    }

    public is(code: string): boolean {
        return this.code == code;
    }

    public is_ok(): this is OkCls<any> {
        return false;
    }

    public is_err(): this is ErrCls {
        return true;
    }

    public get ok(): undefined {
        return;
    }

    public get err(): this {
        return this;
    }

    public unwrap(): never {
        throw this;
    }

    public static from_native(err: Error): ErrCls {
        return new ErrCls(err.message, ecode.Err);
    }
}

export enum ecode {
    Err = "err",
    Panic = "panic_err",
    Val = "val_err",
    NotFound = "not_found_err",
    AlreadyProcessed = "already_processed_err",
    Unsupported = "unsupported_err",
    Lock = "lock_err"
}

export type Res<T> = OkCls<T> | ErrCls;

/// Calls a function and wraps retval to [`Res`] - to [`Err`] on thrown
/// exception and to [`Ok`] otherwise.
///
/// Useful to integrate non-result functions.
export function resultify<T>(fn: () => T): Res<T> {
    try {
        let r = fn();
        return Ok(r);
    } catch (err) {
        return ErrFromNative(err as Error);
    }
}

/// Wraps function raised error into `Err(e)`, or returns the retval as it is.
///
/// Useful to ensure that result-based function never throws.
export function secure<T>(fn: () => Res<T>): Res<T> {
    try {
        return fn();
    } catch (err) {
        return ErrFromNative(err as Error);
    }
}

export function panic(msg?: string): never {
    throw new ErrCls(msg, ecode.Panic);
}

export function assert(condition: boolean, msg?: string): void {
    if (!condition) {
        panic(msg);
    }
}

export function pipeResultify<T>(): RxPipe<T, Res<T>> {
    return pipe(
        map(v => {
            return Ok(v);
        }),
        catchError(err => {
            return of(ErrFromNative(err));
        })
    );
}

export type RxPipe<TInp, TOut> = UnaryFunction<
    Observable<TInp>, Observable<TOut>
>

export function pipeSecure<T>(): RxPipe<Res<T>, Res<T>> {
    return pipe(
        catchError(err => {
            return of(ErrFromNative(err));
        })
    );
}

export function pipeUnwrap<T>(): RxPipe<Res<T>, T> {
    return pipe(
        map(val => {
            return val.unwrap();
        })
    );
}

export function pipeDebug(): RxPipe<any, any> {
    return pipe(
        map(val => {
            log.debug(val)
            return val
        })
    );
}

export function pipeWarn(): RxPipe<any, any> {
    return pipe(
        map(val => {
            log.warn(val)
            return val
        })
    );
}

export function pipeTakeFirst<T>(): RxPipe<T[], Res<T>> {
    return pipe(
        map(val => {
            if (val.length == 0) {
                return Err("empty arr to take from")
            }
            return Ok(val[0])
        })
    );
}

export function pipeTakeFirstUnwrap<T>(): RxPipe<T[], T> {
    return pipe(
        pipeTakeFirst(),
        pipeUnwrap()
    );
}

export function pipeOkOrEmptyArr<T>(): RxPipe<Res<T[]>, T[]> {
    return pipe(
        map(val => {
            if (val.is_err()) {
                return []
            }
            return val.ok
        })
    )
}

export function pipeOkOrUndefined<T>(): RxPipe<Res<T>, T | undefined> {
    return pipe(
        map(val => {
            if (val.is_err()) {
                return undefined
            }
            return val.ok
        })
    )
}

export function pipeOkOrNull<T>(): RxPipe<Res<T>, T | null> {
    return pipe(
        map(val => {
            if (val.is_err()) {
                return null
            }
            return val.ok
        })
    )
}
