'use client';

import { type ReactNode, useState, useMemo, useCallback } from 'react';
import { Modal } from './modal';
import { ChevronLeft, ChevronRight, Check } from 'lucide-react';

/* ────────────────── Types ────────────────── */

export type WizardStep = {
  /** Unique step key */
  id: string;
  /** Human-readable step label, e.g. "Thông tin cơ bản" */
  title: string;
  /** Optional description shown below title */
  description?: string;
  /** Content renderer for this step */
  content: ReactNode;
  /** Optional validation callback — return true if step data is valid */
  isValid?: () => boolean;
};

type WizardModalProps = {
  open: boolean;
  onClose: () => void;
  /** Modal header title */
  title: string;
  /** Steps definitions */
  steps: WizardStep[];
  /** Called when user completes the final step */
  onComplete: () => void;
  /** True while the final submit is in progress */
  busy?: boolean;
  /** Custom complete button label. Default: "Hoàn tất" */
  completeLabel?: string;
};

/* ────────────────── Component ────────────── */

export function WizardModal({
  open,
  onClose,
  title,
  steps,
  onComplete,
  busy = false,
  completeLabel = 'Hoàn tất',
}: WizardModalProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const totalSteps = steps.length;

  const currentStep = useMemo(() => steps[currentIndex] ?? steps[0], [steps, currentIndex]);

  const canGoBack = currentIndex > 0;
  const isLastStep = currentIndex === totalSteps - 1;

  const isCurrentValid = useMemo(() => {
    if (!currentStep?.isValid) return true;
    return currentStep.isValid();
  }, [currentStep]);

  const handleNext = useCallback(() => {
    if (!isCurrentValid) return;
    if (isLastStep) {
      onComplete();
    } else {
      setCurrentIndex((prev) => Math.min(prev + 1, totalSteps - 1));
    }
  }, [isCurrentValid, isLastStep, onComplete, totalSteps]);

  const handleBack = useCallback(() => {
    setCurrentIndex((prev) => Math.max(prev - 1, 0));
  }, []);

  // Reset index when modal closes/opens
  const handleClose = useCallback(() => {
    setCurrentIndex(0);
    onClose();
  }, [onClose]);

  const progressPercent = totalSteps > 1 ? ((currentIndex + 1) / totalSteps) * 100 : 100;

  const footer = (
    <div className="wizard-modal-footer">
      <div className="wizard-modal-footer-left">
        <span className="wizard-modal-step-indicator">
          Bước {currentIndex + 1} / {totalSteps}
        </span>
      </div>
      <div className="wizard-modal-footer-right">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={handleClose}
          disabled={busy}
        >
          Hủy
        </button>
        {canGoBack && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={handleBack}
            disabled={busy}
          >
            <ChevronLeft size={16} />
            Quay lại
          </button>
        )}
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleNext}
          disabled={busy || !isCurrentValid}
        >
          {isLastStep ? (
            <>
              <Check size={16} />
              {busy ? 'Đang xử lý…' : completeLabel}
            </>
          ) : (
            <>
              Tiếp theo
              <ChevronRight size={16} />
            </>
          )}
        </button>
      </div>
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={title}
      footer={footer}
      maxWidth="820px"
    >
      {/* ── Step indicator bar ─────────────── */}
      <div className="wizard-modal-stepper">
        {steps.map((step, index) => {
          const isDone = index < currentIndex;
          const isActive = index === currentIndex;
          return (
            <div
              key={step.id}
              className={`wizard-modal-stepper-item${isActive ? ' is-active' : ''}${isDone ? ' is-done' : ''}`}
            >
              <div className="wizard-modal-stepper-dot">
                {isDone ? <Check size={12} /> : <span>{index + 1}</span>}
              </div>
              <span className="wizard-modal-stepper-label">{step.title}</span>
            </div>
          );
        })}
      </div>

      {/* ── Progress bar ──────────────────── */}
      <div className="wizard-modal-progress">
        <div
          className="wizard-modal-progress-fill"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* ── Step description ──────────────── */}
      {currentStep?.description && (
        <p className="wizard-modal-step-description">{currentStep.description}</p>
      )}

      {/* ── Step content ──────────────────── */}
      <div className="wizard-modal-step-content">
        {currentStep?.content}
      </div>
    </Modal>
  );
}
