import type {HoleShape, HoleType} from '../types';

export type PropertiesPanelProps = {
  selectedCount: number;
  affectedCount: number;
  selectedHoleType: HoleType;
  selectedHoleShape: HoleShape;
  selectedHidden: boolean;
  menuDiameter: string;
  mirrorHorizontal: boolean;
  mirrorVertical: boolean;
  onMenuDiameterChange: (value: string) => void;
  onApplyDiameter: () => void;
  onSetHidden: (hidden: boolean) => void;
  onSetShape: (shape: HoleShape) => void;
  onSetType: (type: HoleType) => void;
  onMirrorHorizontal: (value: boolean) => void;
  onMirrorVertical: (value: boolean) => void;
  onReset: () => void;
};

export default function PropertiesPanel({
  selectedCount,
  affectedCount,
  selectedHoleType,
  selectedHoleShape,
  selectedHidden,
  menuDiameter,
  mirrorHorizontal,
  mirrorVertical,
  onMenuDiameterChange,
  onApplyDiameter,
  onSetHidden,
  onSetShape,
  onSetType,
  onMirrorHorizontal,
  onMirrorVertical,
  onReset,
}: PropertiesPanelProps) {
  return (
    <aside className="properties-panel panel">
      <div className="panel-header">
        <h2>Properties</h2>
      </div>
      <div className="panel-body properties-body">
        {selectedCount > 0 ? (
          <>
            <div className="property-summary">
              <strong>{selectedCount === 1 ? '1 hole selected' : `${selectedCount} holes selected`}</strong>
              {affectedCount > selectedCount ? <span>Affects {affectedCount} with symmetry</span> : null}
            </div>

            <label className="field">
              <span>Type</span>
              <select value={selectedHoleType} onChange={(event) => onSetType(event.target.value as HoleType)}>
                <option value="tube">Tube</option>
                <option value="tieRod">Tie Rod</option>
              </select>
            </label>

            <label className="field">
              <span>Diameter (mm)</span>
              <input
                type="number"
                min="0.1"
                step="0.1"
                value={menuDiameter}
                onChange={(event) => onMenuDiameterChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    onApplyDiameter();
                  }
                }}
              />
            </label>
            <button type="button" className="button secondary" onClick={onApplyDiameter}>
              Apply diameter
            </button>

            <div className="segmented-controls" aria-label="Visibility">
              <button type="button" className={!selectedHidden ? 'is-active' : undefined} onClick={() => onSetHidden(false)}>
                Cut
              </button>
              <button type="button" className={selectedHidden ? 'is-active' : undefined} onClick={() => onSetHidden(true)}>
                Hidden
              </button>
            </div>

            <div className="segmented-controls" aria-label="Hole shape">
              <button
                type="button"
                className={selectedHoleShape === 'circle' ? 'is-active' : undefined}
                onClick={() => onSetShape('circle')}
              >
                Circle
              </button>
              <button
                type="button"
                className={selectedHoleShape === 'square' ? 'is-active' : undefined}
                onClick={() => onSetShape('square')}
              >
                Square
              </button>
            </div>

            <div className="property-box" aria-label="Symmetry options">
              <div className="property-box__title">Apply symmetry</div>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={mirrorHorizontal}
                  onChange={(event) => onMirrorHorizontal(event.target.checked)}
                />
                <span>Horizontal</span>
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={mirrorVertical}
                  onChange={(event) => onMirrorVertical(event.target.checked)}
                />
                <span>Vertical</span>
              </label>
            </div>

            <button type="button" className="button danger" onClick={onReset}>
              Reset selected
            </button>
          </>
        ) : (
          <p className="empty-properties">Select one or more holes to edit type, diameter, visibility, and shape.</p>
        )}
      </div>
    </aside>
  );
}
