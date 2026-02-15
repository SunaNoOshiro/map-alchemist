import React, { useState } from 'react';
import { X } from 'lucide-react';
import { getSectionColor } from '@/constants';
import { UI_CONTROLS, UI_TYPOGRAPHY, uiClass } from '@shared/styles/uiTokens';

type MaputnikPublishInfo = {
  styleUrl: string;
  spriteBaseUrl: string;
  runtimeUrl: string;
  embedSnippet: string;
};

interface MaputnikPublishModalProps {
  stage: 'idle' | 'pre' | 'publishing' | 'done' | 'error';
  info: MaputnikPublishInfo | null;
  error: string | null;
  demoPoisEnabled: boolean;
  onToggleDemoPois: (enabled: boolean) => void;
  onPublish: () => void;
  onClose: () => void;
}

const MaputnikPublishModal: React.FC<MaputnikPublishModalProps> = ({
  stage,
  info,
  error,
  demoPoisEnabled,
  onToggleDemoPois,
  onPublish,
  onClose
}) => {
  const [copied, setCopied] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const accent = getSectionColor('theme-library');
  const accentBorder = `${accent}55`;

  if (stage === 'idle') return null;

  const isPublishing = stage === 'publishing';
  const showResults = stage === 'done' && info;
  const showPrePublish = stage === 'pre' || stage === 'error';
  const maputnikUrl = info
    ? `https://maputnik.github.io/editor?style=${encodeURIComponent(info.styleUrl)}`
    : '';

  const handleCopy = async () => {
    if (!info) return;
    try {
      await navigator.clipboard.writeText(info.styleUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      setCopied(false);
    }
  };

  const handleCopySnippet = async () => {
    if (!info) return;
    try {
      await navigator.clipboard.writeText(info.embedSnippet);
      setCopiedSnippet(true);
      setTimeout(() => setCopiedSnippet(false), 1500);
    } catch (error) {
      setCopiedSnippet(false);
    }
  };

  const handleOpenMaputnik = () => {
    if (!info) return;
    handleCopy();
    window.open(maputnikUrl, '_blank', 'noopener,noreferrer');
  };

  const title = stage === 'pre'
    ? 'Publish to Maputnik'
    : stage === 'publishing'
      ? 'Publishing to GitHub Pages'
      : stage === 'done'
        ? 'Maputnik export published'
        : 'Publish failed';

  return (
    <div
      data-testid="maputnik-publish-modal-overlay"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-3 sm:items-center"
    >
      <div
        data-testid="maputnik-publish-modal"
        className="my-2 flex max-h-[min(94vh,920px)] w-full max-w-xl flex-col overflow-hidden rounded-lg border border-gray-700 bg-gray-900 text-white shadow-2xl sm:my-0"
      >
        <div className="flex items-start justify-between border-b border-gray-700 bg-gray-900 px-4 py-2.5">
          <div>
            <h2 className={uiClass(UI_TYPOGRAPHY.subheading, 'text-white')}>{title}</h2>
            {showResults && (
              <p className={uiClass(UI_TYPOGRAPHY.compact, 'text-gray-500')}>Use this URL to preview your style.</p>
            )}
            {showPrePublish && (
              <p className={uiClass(UI_TYPOGRAPHY.compact, 'text-gray-500')}>Choose whether to include demo POIs before publishing.</p>
            )}
            {isPublishing && (
              <p className={uiClass(UI_TYPOGRAPHY.compact, 'text-gray-500')}>Hold tight, uploading style and sprites.</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isPublishing}
            className={uiClass(UI_CONTROLS.subtleButton, 'px-2')}
            aria-label="Close panel"
          >
            <X size={14} />
            <span className="hidden sm:inline">Close</span>
          </button>
        </div>

        <div data-testid="maputnik-publish-modal-content" className="space-y-3 overflow-y-auto px-4 py-3">
          {showPrePublish && (
            <div className={uiClass(UI_CONTROLS.panel, 'p-3 text-gray-200')}>
              <div className="flex items-center justify-between">
                <div>
                  <div className={uiClass(UI_TYPOGRAPHY.sectionLabel)} style={{ color: accent }}>Demo POIs (for Maputnik preview)</div>
                  <p className={uiClass(UI_TYPOGRAPHY.compact, 'text-gray-500')}>
                    When enabled, the export includes demo POIs for every icon type.
                  </p>
                </div>
                <label className={uiClass(UI_TYPOGRAPHY.compact, 'flex items-center gap-2 text-gray-400')}>
                  <input
                    type="checkbox"
                    checked={demoPoisEnabled}
                    onChange={(event) => onToggleDemoPois(event.target.checked)}
                    className="h-3 w-3"
                    style={{ accentColor: accent }}
                  />
                  <span>{demoPoisEnabled ? 'On' : 'Off'}</span>
                </label>
              </div>
            </div>
          )}

          {stage === 'error' && (
            <div className={uiClass(UI_TYPOGRAPHY.body, 'rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-3 text-red-100')}>
              {error || 'Publish failed. Please try again.'}
            </div>
          )}

          {showPrePublish && (
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className={UI_CONTROLS.subtleButton}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onPublish}
                className={UI_CONTROLS.button}
                style={{ borderColor: accentBorder, color: accent }}
              >
                Publish now
              </button>
            </div>
          )}

          {isPublishing && (
            <div className={uiClass(UI_CONTROLS.panelInset, UI_TYPOGRAPHY.body, 'px-3 py-2 text-gray-400')}>
              Publishing… please keep this tab open.
            </div>
          )}

          {showResults && (
            <>
              <div>
                <div className="flex items-center justify-between">
                  <span className={uiClass(UI_TYPOGRAPHY.sectionLabel, 'text-gray-500')}>Style URL</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleOpenMaputnik}
                      className={uiClass(UI_CONTROLS.button, 'px-2')}
                      style={{ borderColor: accentBorder, color: accent }}
                    >
                      Open in Maputnik
                    </button>
                    <button
                      type="button"
                      onClick={handleCopy}
                      className={uiClass(UI_CONTROLS.subtleButton, 'px-2')}
                    >
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
                <div className={uiClass(UI_CONTROLS.panelInset, UI_TYPOGRAPHY.compact, 'mt-1.5 px-3 py-2 text-gray-200 bg-gray-950')}>
                  {info.styleUrl}
                </div>
              </div>

              <div>
                <span className={uiClass(UI_TYPOGRAPHY.sectionLabel, 'text-gray-500')}>Sprite Base</span>
                <div className={uiClass(UI_CONTROLS.panelInset, UI_TYPOGRAPHY.compact, 'mt-1.5 px-3 py-2 text-gray-200 bg-gray-950')}>
                  {info.spriteBaseUrl}
                </div>
              </div>

              <div>
                <span className={uiClass(UI_TYPOGRAPHY.sectionLabel, 'text-gray-500')}>Runtime Script URL</span>
                <div className={uiClass(UI_CONTROLS.panelInset, UI_TYPOGRAPHY.compact, 'mt-1.5 px-3 py-2 text-gray-200 bg-gray-950')}>
                  {info.runtimeUrl}
                </div>
              </div>

              <div className={uiClass(UI_CONTROLS.panel, UI_TYPOGRAPHY.body, 'p-3 text-gray-200')}>
                <div className="mb-2 flex items-center justify-between">
                  <div className={uiClass(UI_TYPOGRAPHY.sectionLabel)} style={{ color: accent }}>Customer Embed Snippet</div>
                  <button
                    type="button"
                    onClick={handleCopySnippet}
                    className={uiClass(UI_CONTROLS.subtleButton, 'px-2')}
                  >
                    {copiedSnippet ? 'Copied' : 'Copy snippet'}
                  </button>
                </div>
                <pre className={uiClass(UI_CONTROLS.panelInset, 'max-h-56 overflow-auto bg-gray-950 p-3 text-gray-200', UI_TYPOGRAPHY.meta)}>
{info.embedSnippet}
                </pre>
              </div>

              <div className={uiClass(UI_CONTROLS.panel, UI_TYPOGRAPHY.body, 'p-3 text-gray-200')}>
                <div className={uiClass(UI_TYPOGRAPHY.sectionLabel)} style={{ color: accent }}>How to open in Maputnik</div>
                <ol className={uiClass(UI_TYPOGRAPHY.compact, 'mt-2 list-decimal space-y-1 pl-4')}>
                  <li>Click "Open in Maputnik" above (opens a new tab)</li>
                  <li>If it doesn't auto-load, click "Open"</li>
                  <li>Choose "Open URL"</li>
                  <li>Paste the Style URL above</li>
                </ol>
                <p className={uiClass(UI_TYPOGRAPHY.compact, 'mt-3 text-gray-500')}>
                  If icons don’t appear, wait for GitHub Pages to finish deploying the latest commit.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default MaputnikPublishModal;
