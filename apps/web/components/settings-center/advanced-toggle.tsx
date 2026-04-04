'use client';

type AdvancedToggleProps = {
  value: boolean;
  onChange: (next: boolean) => void;
};

export function AdvancedToggle({ value, onChange }: AdvancedToggleProps) {
  return (
    <label className="checkbox-wrap settings-advanced-toggle">
      <input
        type="checkbox"
        checked={value}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>Chế độ Chuyên gia / IT</span>
    </label>
  );
}
