import type { ReactNode } from 'react';

// Mini-Markdown sûr (aucun HTML injecté) : titres, listes, cases à cocher, gras, italique.

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith('**')) out.push(<strong key={`${keyBase}-${i++}`}>{tok.slice(2, -2)}</strong>);
    else out.push(<em key={`${keyBase}-${i++}`}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text, className }: { text: string; className?: string }) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const nodes: ReactNode[] = [];
  let list: { ordered: boolean; items: ReactNode[] } | null = null;
  let para: string[] = [];

  const flushPara = () => {
    if (!para.length) return;
    const k = nodes.length;
    nodes.push(
      <p key={`p${k}`}>
        {para.map((l, idx) => (
          <span key={idx}>
            {idx > 0 && <br />}
            {inline(l, `p${k}-${idx}`)}
          </span>
        ))}
      </p>,
    );
    para = [];
  };
  const flushList = () => {
    if (!list) return;
    const k = nodes.length;
    nodes.push(list.ordered ? <ol key={`l${k}`}>{list.items}</ol> : <ul key={`l${k}`}>{list.items}</ul>);
    list = null;
  };

  lines.forEach((raw, idx) => {
    const line = raw.trimEnd();
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (!line.trim()) {
      flushPara();
      flushList();
    } else if (heading) {
      flushPara();
      flushList();
      const level = Math.min(heading[1].length + 2, 6);
      const Tag = `h${level}` as 'h3';
      nodes.push(<Tag key={`h${idx}`}>{inline(heading[2], `h${idx}`)}</Tag>);
    } else if (bullet || numbered) {
      flushPara();
      const ordered = !!numbered;
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      const body = (bullet ?? numbered)![1];
      const task = /^\[( |x|X)\]\s+(.*)$/.exec(body);
      list.items.push(
        <li key={idx} className={task ? 'task' : undefined}>
          {task ? (
            <>
              <input type="checkbox" checked={task[1] !== ' '} readOnly aria-hidden /> {inline(task[2], `li${idx}`)}
            </>
          ) : (
            inline(body, `li${idx}`)
          )}
        </li>,
      );
    } else {
      flushList();
      para.push(line);
    }
  });
  flushPara();
  flushList();
  return <div className={className ? `md ${className}` : 'md'}>{nodes}</div>;
}
