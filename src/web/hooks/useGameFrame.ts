import { useCallback, useEffect, useRef } from 'react';
import { IframeToHost } from '../../shared/protocol';
import type { HostToIframeMsg, IframeToHostMsg } from '../../shared/protocol';

export function useGameFrame(
  iframe: React.RefObject<HTMLIFrameElement | null>,
  onMessage: (msg: IframeToHostMsg) => void,
) {
  const onMsgRef = useRef(onMessage);
  onMsgRef.current = onMessage;

  useEffect(() => {
    const h = (e: MessageEvent) => {
      if (e.source !== iframe.current?.contentWindow) return;
      const parsed = IframeToHost.safeParse(e.data);
      if (!parsed.success) return console.warn('iframe msg rejected', e.data);
      onMsgRef.current(parsed.data);
    };
    window.addEventListener('message', h);
    return () => window.removeEventListener('message', h);
  }, [iframe]);

  const send = useCallback(
    (msg: HostToIframeMsg) => iframe.current?.contentWindow?.postMessage(msg, '*'),
    [iframe],
  );
  return { send };
}
