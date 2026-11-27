import { Children, isValidElement, useState } from "react";
import "./Stepper.css";

export function Step({ children }) {
  return <div className="stepper__step">{children}</div>;
}

export default function Stepper({
  children,
  step,
  initialStep = 1,
  onStepChange = () => {},
  onFinalStepCompleted = () => {},
  linear = false,
  backButtonText = "Anterior",
  nextButtonText = "Continuar",
  completeButtonText = "Guardar",
  backButtonProps = {},
  nextButtonProps = {},
  accentColor = "#e9650a",
  className = "",
}) {
  const steps = Children.toArray(children).filter(isValidElement);
  const controlled = typeof step === "number";
  const [internalStep, setInternalStep] = useState(initialStep);
  const [furthestStep, setFurthestStep] = useState(initialStep);
  const currentStep = Math.min(Math.max(controlled ? step : internalStep, 1), Math.max(steps.length, 1));
  const activeStep = steps[currentStep - 1];

  const goToStep = (target) => {
    const nextStep = Math.min(Math.max(target, 1), steps.length);
    if (nextStep === currentStep) return;
    if (!controlled) setInternalStep(nextStep);
    setFurthestStep((previous) => Math.max(previous, nextStep));
    onStepChange(nextStep);
  };

  const { className: backClassName = "", onClick: onBackClick, ...backProps } = backButtonProps;
  const { className: nextClassName = "", onClick: onNextClick, ...nextProps } = nextButtonProps;
  const isLastStep = currentStep === steps.length;

  return (
    <div className={`stepper ${className}`} style={{ "--stepper-accent": accentColor }}>
      <div className="stepper__progress" role="group" aria-label="Pasos del formulario">
        {steps.map((entry, index) => {
          const number = index + 1;
          const reached = number <= furthestStep;
          return (
            <button
              className="stepper__indicator"
              type="button"
              key={number}
              aria-current={number === currentStep ? "step" : undefined}
              data-reached={reached ? "true" : undefined}
              disabled={linear && number > furthestStep}
              onClick={() => goToStep(number)}
            >
              <span className={`stepper__number${reached ? " is-reached" : ""}`}>
                {number < currentStep ? <span aria-hidden="true">✓</span> : number}
              </span>
              <span className="stepper__label">{entry.props.title || `Paso ${number}`}</span>
            </button>
          );
        })}
      </div>
      <div className="stepper__content" aria-live="polite">
        {activeStep}
      </div>
      <div className="stepper__footer">
        <button
          type="button"
          {...backProps}
          className={`stepper__button stepper__button--back ${backClassName}`}
          disabled={currentStep === 1 || backProps.disabled}
          onClick={(event) => {
            onBackClick?.(event);
            if (!event.defaultPrevented) goToStep(currentStep - 1);
          }}
        >
          <span aria-hidden="true">←</span> {backButtonText}
        </button>
        <span className="stepper__counter">{currentStep} de {steps.length}</span>
        <button
          type="button"
          {...nextProps}
          className={`stepper__button stepper__button--next ${nextClassName}`}
          onClick={(event) => {
            onNextClick?.(event);
            if (event.defaultPrevented) return;
            if (isLastStep) onFinalStepCompleted();
            else goToStep(currentStep + 1);
          }}
        >
          {isLastStep ? completeButtonText : nextButtonText} <span aria-hidden="true">{isLastStep ? "✓" : "→"}</span>
        </button>
      </div>
    </div>
  );
}
