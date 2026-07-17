import {MAX_ZOOM, MIN_ZOOM} from './types';

export type ZoomControlsProps = {
  zoom: number;
  visibleCount: number;
  totalCount: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomChange: (zoom: number) => void;
  onFit: () => void;
};

export default function ZoomControls({
  zoom,
  visibleCount,
  totalCount,
  onZoomIn,
  onZoomOut,
  onZoomChange,
  onFit,
}: ZoomControlsProps) {
  return (
    <div className="preview-zoom-controls" aria-label="Preview zoom controls">
      <button type="button" className="preview-zoom-button" onClick={onZoomOut} aria-label="Zoom out">
        -
      </button>
      <input
        className="preview-zoom-slider"
        type="range"
        min={MIN_ZOOM}
        max={MAX_ZOOM}
        step="0.05"
        value={zoom}
        aria-label="Zoom level"
        onChange={(event) => onZoomChange(Number(event.target.value))}
      />
      <button type="button" className="preview-zoom-button" onClick={onZoomIn} aria-label="Zoom in">
        +
      </button>
      <button type="button" className="preview-fit-button" onClick={onFit}>
        Fit
      </button>
      <div className="preview-zoom-readout">
        <strong>{Math.round(zoom * 100)}%</strong>
        <span>
          {visibleCount}/{totalCount}
        </span>
      </div>
    </div>
  );
}
