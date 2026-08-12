import React, { useEffect, useRef, useState } from 'react';
import { Check, Copy, TerminalSquare } from 'lucide-react';
import { BuildRun } from '@/types';

interface CustomBuildRunLogViewerProps {
  job: BuildRun | null;
}

const CustomBuildRunLogViewer: React.FC<CustomBuildRunLogViewerProps> = ({ job }) => {
  const logRef = useRef<HTMLPreElement | null>(null);
  const [logsCopied, setLogsCopied] = useState(false);
  const consoleLines = job?.logs?.length ? job.logs : ['No log output yet.'];

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [job?.logs?.length, job?.status]);

  useEffect(() => {
    setLogsCopied(false);
  }, [job?.id]);

  const copyLogs = async () => {
    const text = consoleLines.join('\n');
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const el = document.createElement('textarea');
        el.value = text;
        el.style.position = 'fixed';
        el.style.left = '-9999px';
        document.body.appendChild(el);
        el.focus();
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
      }
      setLogsCopied(true);
      window.setTimeout(() => setLogsCopied(false), 1200);
    } catch {
      setLogsCopied(false);
    }
  };

  return (
    <div className="border-t border-[var(--hub-line)] pt-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-[var(--hub-ink)]">Console log</h3>
          <TerminalSquare size={14} className="text-[var(--hub-ink-3)]" />
        </div>
        <button type="button" className="hub-btn ghost sm" onClick={copyLogs}>
          {logsCopied ? <Check size={12} /> : <Copy size={12} />}
          <span className="ml-1">{logsCopied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre
        ref={logRef}
        className="max-h-[22rem] overflow-auto whitespace-pre-wrap rounded border border-[var(--hub-line)] bg-[var(--hub-bg-2)] p-3 text-xs leading-5"
      >
        {consoleLines.join('\n')}
      </pre>
    </div>
  );
};

export default CustomBuildRunLogViewer;
