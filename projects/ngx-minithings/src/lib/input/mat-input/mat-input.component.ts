import {
  Component,
  ElementRef,
  EventEmitter,
  Inject,
  Input,
  Output,
  OnInit,
  OnDestroy,
  Optional,
  Self,
  ViewChild,
  HostBinding
} from "@angular/core";
import { Subject, Subscription } from "rxjs";
import { SelectedInputService }
  from "../selected-input/selected-input.service";
import { ValueValidatorEvent }
  from "../selected-input/value-validator-event";
import { SelectedInputEvent, ValueHost}
  from "../selected-input/selected-input";
import { InputType } from "../input-type";
import {
  FormControl,
  FormGroup,
  ControlValueAccessor,
  NgControl,
  NgForm,
  FormGroupDirective
} from "@angular/forms";
import { FocusMonitor } from "@angular/cdk/a11y";
import { BooleanInput, coerceBooleanProperty } from "@angular/cdk/coercion";
import {
  MAT_FORM_FIELD,
  MatFormField,
  MatFormFieldControl,
} from "@angular/material/form-field";
import {
  InputErrorStateMatcher,
  getDefaultErrorMessage
} from "./error-content";

@Component({
  selector: "ngx-minithings-mat-input",
  templateUrl: "./mat-input.component.html",
  styleUrls: ["./mat-design.scss"],
  providers: [
    { provide: MatFormFieldControl, useExisting: MatInputComponent },
  ]
})
export class MatInputComponent<T>
implements OnInit, OnDestroy, ControlValueAccessor, MatFormFieldControl<T>
{
  public static nextId: number = 0;
  @Input() public type: InputType = InputType.Text;
  @Input() public id: string = `mat-input-${MatInputComponent.nextId++}`;
  @Input() public localizedName: string = "noname";
  @Input() public attrList: string[] = [];

  @Input() public showErrors: boolean = true;
  @Input() public customErrorMessages: Map<string, string> = new Map();

  @Input() public autocompleteRequired: boolean = false;
  @Input() public fillingOptions: Array<T> = [];

  @Input("aria-describedby") public userAriaDescribedBy: string;
  @Input() public required: boolean = false;

  @Input()
  public get placeholder(): string
  {
    return this._placeholder;
  }
  public set placeholder(value: string)
  {
    this._placeholder = value;
    this.stateChanges.next();
  }
  private _placeholder: string = "";

  @Input()
  public get disabled(): boolean
  {
    return this._disabled;
  }
  public set disabled(value: BooleanInput)
  {
    this._disabled = coerceBooleanProperty(value);
    this._disabled ? this.formControl.disable() : this.formControl.enable();
    this._disabled ? this.supportFormGroup.disable()
      : this.supportFormGroup.enable();
    this._disabled ? this.fictiveFormControl.disable()
      : this.fictiveFormControl.enable();
    this.stateChanges.next();
  }
  private _disabled: boolean = false;

  @Input()
  public get value(): T | null
  {
    return this.formControl.value;
  }
  public set value(val: T | null)
  {
    val = val === "" ? null : val;
    if (this.type == InputType.DateRange)
    {
      if (this.valFromViewFlag == true)
        this.valFromViewFlag = false;
      else
      {
        const arrVal: Array<Date | null> = val != null
          ? val as Array<Date | null>
          : [null, null];
        this.supportFormGroup.setValue({
          first: arrVal[0],
          second: arrVal[1]
        });
      }
    }
    this.formControl.setValue(val);
    this.inputValue.emit(val);
    this.stateChanges.next();
  }

  @Output() public inputValue: EventEmitter<any> = new EventEmitter<any>();

  @ViewChild("main", { read: ElementRef }) public mainElementRef: ElementRef;

  public formControl: FormControl = new FormControl("", {nonNullable: true});
  public stateChanges: Subject<void> = new Subject<void>();
  public matcher: InputErrorStateMatcher = new InputErrorStateMatcher();
  public errorState: boolean = false;
  public focused: boolean = false;
  public touched: boolean = false;
  public controlType: string = "mat-input-comp";
  /* eslint-disable */
  public onChange: (value: any) => void = (_: any) => {};
  public onTouched: () => void = () => {};
  /* eslint-enable */

  private selectedInputEventSubscription: Subscription;

  public InputType: any = InputType;

  public supportFormGroup: FormGroup = new FormGroup({
    first: new FormControl(null),
    second: new FormControl(null),
  });
  private valFromViewFlag: boolean = false;
  public fictiveFormControl: FormControl = new FormControl(null);

  public filteredAutocompleteOptions: Array<T>;

  public constructor(
    private selectedInputService: SelectedInputService,
    private _focusMonitor: FocusMonitor,
    private _elementRef: ElementRef<HTMLElement>,
    @Optional() @Inject(MAT_FORM_FIELD) public _formField: MatFormField,
    @Optional() @Self() public ngControl: NgControl,

    @Optional() private _parentForm: NgForm,
    @Optional() private _parentFormGroup: FormGroupDirective,
  ) 
  {
    if (this.ngControl != null) 
    {
      this.ngControl.valueAccessor = this;
    }

    this.filteredAutocompleteOptions = this.fillingOptions.slice();
  }

  public ngOnInit(): void
  {
    if (this.localizedName == "" || this.localizedName == undefined)
    {
      this.localizedName = "noname";
    }

    this.selectedInputEventSubscription =
      this.selectedInputService.eventBus$.subscribe({
        next: (event: SelectedInputEvent<any>) =>
        {
          if (
            event.selectedInput.id === this.id
            // do not re-accept self-made changes
            && event.host !== ValueHost.INPUT
          )
          {
            // don't resend an input change event back to keyboard, because
            // here the keyboard initiated the change
            this.sendInputMockEvent(event.value, true);
          }
        }
      });
  }

  @HostBinding("class.floating")
  public get shouldLabelFloat(): boolean
  {
    return this.focused || !this.empty;
  }

  public get empty(): boolean
  {
    return this.formControl.value == null
      || this.formControl.value === ""
      || (this.type == InputType.DateRange
          && this.formControl.value instanceof Array
          && this.formControl.value.length == 2
          && this.formControl.value[0] == null
          && this.formControl.value[1] == null);
  }

  public filterAutocomplete(event: any): void 
  {
    const val: any = event.target.value;
    this.filteredAutocompleteOptions =
      this.fillingOptions.filter(
        opt => String(opt).toLowerCase().includes(String(val)));
  }

  public ngDoCheck(): void
  {
    if (this.ngControl != null)
    {
      this.updateErrorState();
    }
  }

  private updateErrorState(): void
  {
    const parent: NgForm | FormGroupDirective | null =
      this._parentFormGroup != null
        ? this._parentFormGroup
        : (this._parentForm != null
          ? this._parentForm
          : null);

    const oldState: boolean = this.errorState;
    const newState: boolean =
      (this.ngControl == null ? false : (this.ngControl.invalid ?? false))
        && (this.touched || (parent != null && parent.submitted));

    if (oldState !== newState)
    {
      this.errorState = newState;
      this.matcher.errorState = newState;
      this.stateChanges.next();
    }
  }

  public onFocusIn(): void
  {
    if (!this.focused) 
    {
      this.selectedInputService.select(
        {
          id: this.id,
          name: this.localizedName,
          type: this.type,
        },
        this.value
      );
      this.focused = true;
      this.stateChanges.next();
    }
  }

  public onFocusOut(event: FocusEvent): void
  {
    if (!this._elementRef.nativeElement.contains(
      event.relatedTarget as Element))
    {
      this.touched = true;
      this.focused = false;
      this.onTouched();
      this.stateChanges.next();
    }
  }

  public setDescribedByIds(ids: string[]): void
  {
    const controlElement: Element =
      this._elementRef.nativeElement.querySelector(
        ".mat-input-comp-container",
      )!;
    controlElement.setAttribute("aria-describedby", ids.join(" "));
  }

  public onContainerClick(): void
  {
    // TODO: check this function works with big containers
    // if it doesn't return back
    // @ViewChild("main") public mainInput: HTMLInputElement;
    // and use mainInput instead of mainElementRef.nativeElement
    this._focusMonitor.focusVia(this.mainElementRef.nativeElement, "program");
  }

  public writeValue(val: T | null): void 
  {
    this.value = val;
    if (this.selectedInputService.isSelected(this.id))
    {
      this.selectedInputService.sendInputValue(
        val ?? ValueValidatorEvent.Clear
      );
    }
  }

  public registerOnChange(fn: any): void 
  {
    this.onChange = fn;
  }

  public registerOnTouched(fn: any): void 
  {
    this.onTouched = fn;
  }

  public setDisabledState(isDisabled: boolean): void 
  {
    this.disabled = isDisabled;
  }

  public sendListChangeEvent(changes: any): void
  {
    this.sendInputMockEvent(changes.map((item: any) => item.value));
  }

  public sendInputMockEvent(val: any, virtualKeyboard: boolean = false): void
  {
    const mockEvent: any = {
      target: {
        value: val !== ValueValidatorEvent.Clear
          ? val
          : null
      }
    };
    this.onInput(mockEvent, virtualKeyboard);
  }

  public onInput(event: any, virtualKeyboardInput: boolean = false): void
  {
    let val: any = event.target.value;
    if (virtualKeyboardInput == true)
    {
      switch(this.type)
      {
        case InputType.Number:
          this.mainElementRef.nativeElement.value = val;
          this.mainElementRef.nativeElement.dispatchEvent(
            new Event("input", { bubbles: true }));
          return;
        case InputType.Date:
        case InputType.DateRange:
        case InputType.Time:
        case InputType.Select:
          val = "";
          virtualKeyboardInput = false;
          break;
        case InputType.Check:
          val = false;
          virtualKeyboardInput = false;
          break;
        case InputType.RadioList:
        case InputType.CheckList:
          val = [];
          virtualKeyboardInput = false;
          break;
        default:
          break;
      }
    }
    else
    {
      if (this.type == InputType.DateRange)
      {
        if (val != null)
          this.valFromViewFlag = true;
      }
    }

    if (this.autocompleteRequired == true)
    {
      if (this.fillingOptions.includes(val) == false)
        this.matcher.errorState = true;
      else
        this.matcher.errorState = false;
    }

    this.value = val;

    if (this.selectedInputService.isSelected(this.id)
        && virtualKeyboardInput == false)
    {
      this.selectedInputService.sendInputValue(
        (this.value == null || this.value === "")
          ? ValueValidatorEvent.Clear
          : this.value
      );
    }
    this.onChange(this.value);
  }

  public getErrorMessage(): string
  {
    if (this.ngControl != null)
    {
      const { errors } = this.ngControl;
      if (errors != null)
      {
        const errorName: string = Object.keys(errors)[0];
        if (this.customErrorMessages.has(errorName))
          return this.customErrorMessages.get(errorName) ?? "";
        else
          return getDefaultErrorMessage(errorName, errors[errorName]);
      }
    }
    return "UNKNOWN ERROR";
  }

  public ngOnDestroy(): void
  {
    this.stateChanges.complete();
    this._focusMonitor.stopMonitoring(this._elementRef);
  }
}
