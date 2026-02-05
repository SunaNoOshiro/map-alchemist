import React, { useState } from 'react';

type MaputnikPublishInfo = {
  styleUrl: string;
  spriteBaseUrl: string;
};

interface MaputnikPublishModalProps {
  info: MaputnikPublishInfo | null;
  onClose: () => void;
}

const MaputnikPublishModal: React.FC<MaputnikPublishModalProps> = ({ info, onClose }) => {
  const [copied, setCopied] = useState(false);

  if (!info) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(info.styleUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      setCopied(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-gray-900 text-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-white/10 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold">Maputnik export published</h2>
            <p className="text-sm text-white/70">Use this URL to preview your style.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/10 px-3 py-1 text-sm text-white/70 transition hover:border-white/30 hover:text-white"
          >
            Close
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wide text-white/50">Style URL</span>
              <button
                type="button"
                onClick={handleCopy}
                className="rounded-md border border-white/10 px-2 py-1 text-xs text-white/70 transition hover:border-white/30 hover:text-white"
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
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

          <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/80">
            <div className="font-semibold text-white">How to open in Maputnik</div>
            <ol className="mt-2 list-decimal space-y-1 pl-4">
              <li>Open https://maputnik.github.io/</li>
              <li>Click "Open"</li>
              <li>Choose "Open URL"</li>
              <li>Paste the Style URL above</li>
            </ol>
            <p className="mt-3 text-xs text-white/60">
              If icons don’t appear, wait for GitHub Pages to finish deploying the latest commit.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MaputnikPublishModal;
