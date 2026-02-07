import React, { useState } from 'react';

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
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-2 sm:items-center sm:p-4"
    >
      <div
        data-testid="maputnik-publish-modal"
        className="my-2 flex max-h-[min(94vh,920px)] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-gray-900 text-white shadow-2xl sm:my-0"
      >
        <div className="flex items-start justify-between border-b border-white/10 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold">{title}</h2>
            {showResults && (
              <p className="text-sm text-white/70">Use this URL to preview your style.</p>
            )}
            {showPrePublish && (
              <p className="text-sm text-white/70">Choose whether to include demo POIs before publishing.</p>
            )}
            {isPublishing && (
              <p className="text-sm text-white/70">Hold tight, uploading style and sprites.</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isPublishing}
            className="rounded-full border border-white/10 px-3 py-1 text-sm text-white/70 transition hover:border-white/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            Close
          </button>
        </div>

        <div data-testid="maputnik-publish-modal-content" className="space-y-4 overflow-y-auto px-6 py-5">
          {showPrePublish && (
            <div className="rounded-xl border border-white/10 bg-gray-900/50 p-4 text-sm text-white/80">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-white">Demo POIs (for Maputnik preview)</div>
                  <p className="text-xs text-white/60">
                    When enabled, the export includes demo POIs for every icon type.
                  </p>
                </div>
                <label className="flex items-center gap-2 text-xs text-white/70">
                  <input
                    type="checkbox"
                    checked={demoPoisEnabled}
                    onChange={(event) => onToggleDemoPois(event.target.checked)}
                    className="h-3 w-3 accent-emerald-500"
                  />
                  <span>{demoPoisEnabled ? 'On' : 'Off'}</span>
                </label>
              </div>
            </div>
          )}

          {stage === 'error' && (
            <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {error || 'Publish failed. Please try again.'}
            </div>
          )}

          {showPrePublish && (
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-white/10 px-3 py-2 text-xs text-white/70 transition hover:border-white/30 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onPublish}
                className="rounded-md border border-emerald-400/50 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200 transition hover:border-emerald-300 hover:text-emerald-100"
              >
                Publish now
              </button>
            </div>
          )}

          {isPublishing && (
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/70">
              Publishing… please keep this tab open.
            </div>
          )}

          {showResults && (
            <>
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase tracking-wide text-white/50">Style URL</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleOpenMaputnik}
                      className="rounded-md border border-emerald-400/40 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-200 transition hover:border-emerald-300 hover:text-emerald-100"
                    >
                      Open in Maputnik
                    </button>
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="rounded-md border border-white/10 px-2 py-1 text-xs text-white/70 transition hover:border-white/30 hover:text-white"
                    >
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
                <div className="mt-2 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90">
                  {info.styleUrl}
                </div>
              </div>

              <div>
                <span className="text-xs uppercase tracking-wide text-white/50">Sprite Base</span>
                <div className="mt-2 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90">
                  {info.spriteBaseUrl}
                </div>
              </div>

              <div>
                <span className="text-xs uppercase tracking-wide text-white/50">Runtime Script URL</span>
                <div className="mt-2 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90">
                  {info.runtimeUrl}
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/80">
                <div className="mb-2 flex items-center justify-between">
                  <div className="font-semibold text-white">Customer Embed Snippet</div>
                  <button
                    type="button"
                    onClick={handleCopySnippet}
                    className="rounded-md border border-white/10 px-2 py-1 text-xs text-white/70 transition hover:border-white/30 hover:text-white"
                  >
                    {copiedSnippet ? 'Copied' : 'Copy snippet'}
                  </button>
                </div>
                <pre className="max-h-56 overflow-auto rounded-lg border border-white/10 bg-black/40 p-3 text-[11px] leading-relaxed text-gray-200">
{info.embedSnippet}
                </pre>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/80">
                <div className="font-semibold text-white">How to open in Maputnik</div>
                <ol className="mt-2 list-decimal space-y-1 pl-4">
                  <li>Click "Open in Maputnik" above (opens a new tab)</li>
                  <li>If it doesn't auto-load, click "Open"</li>
                  <li>Choose "Open URL"</li>
                  <li>Paste the Style URL above</li>
                </ol>
                <p className="mt-3 text-xs text-white/60">
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
