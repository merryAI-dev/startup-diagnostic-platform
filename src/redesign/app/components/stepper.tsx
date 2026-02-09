import { Check } from "lucide-react";
import { cn } from "../components/ui/utils";

interface StepperProps {
  steps: string[];
  currentStep: number;
  className?: string;
}

export function Stepper({ steps, currentStep, className }: StepperProps) {
  return (
    <div className={cn("w-full", className)}>
      <div className="flex items-center justify-between">
        {steps.map((step, index) => {
          const stepNumber = index + 1;
          const isCompleted = stepNumber < currentStep;
          const isCurrent = stepNumber === currentStep;
          const isUpcoming = stepNumber > currentStep;

          return (
            <div key={index} className="flex-1 flex items-center">
              <div className="flex flex-col items-center flex-1">
                <div className="flex items-center w-full">
                  {/* Step circle */}
                  <div
                    className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all",
                      isCompleted &&
                        "bg-primary border-primary text-primary-foreground",
                      isCurrent &&
                        "bg-primary border-primary text-primary-foreground",
                      isUpcoming && "bg-white border-gray-300 text-gray-400"
                    )}
                  >
                    {isCompleted ? (
                      <Check className="w-5 h-5" />
                    ) : (
                      <span className="text-sm">{stepNumber}</span>
                    )}
                  </div>

                  {/* Connector line */}
                  {index < steps.length - 1 && (
                    <div
                      className={cn(
                        "flex-1 h-0.5 mx-2 transition-colors",
                        isCompleted ? "bg-primary" : "bg-gray-300"
                      )}
                    />
                  )}
                </div>

                {/* Step label */}
                <span
                  className={cn(
                    "mt-2 text-sm text-center",
                    isCurrent && "text-primary",
                    isCompleted && "text-foreground",
                    isUpcoming && "text-muted-foreground"
                  )}
                >
                  {step}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
