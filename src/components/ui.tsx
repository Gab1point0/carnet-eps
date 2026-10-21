import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, MoreHorizontal, X } from 'lucide-react';
import { cls } from '../lib/util';
import { useUi } from '../store/ui';

// ── Boutons ─────────────────────────────────────────────────────────────────

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  icon?: ReactNode;
};

export function Button({ variant = 'secondary', size = 'md', icon, className, children, type = 'button', ...rest }: BtnProps) {
  return (
    <button type={type} className={cls('btn', `btn-${variant}`, size === 'sm' && 'btn-sm', className)} {...rest}>
      {icon}
      {children}
    </button>
  );
}

export function IconButton({
  label,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button type={type} className={cls('icon-btn', className)} aria-label={label} title={label} {...rest}>
      {children}
    </button>
  );
}

// ── Mise en page ────────────────────────────────────────────────────────────

export function PageHeader({
  title,
  subtitle,
  actions,
  back,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  back?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="page-header">
      {back}
      <div className="page-header-row">
        <div className="page-header-text">
          <h1>{title}</h1>
          {subtitle && <p className="muted">{subtitle}</p>}
        </div>
        {actions && <div className="page-header-actions">{actions}</div>}
      </div>
      {children}
    </header>
  );
}

export function Card({ className, children, onClick, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cls('card', onClick && 'card-click', className)} onClick={onClick} {...rest}>
      {children}
    </div>
  );
}

export function Section({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cls('section', className)}>
      {(title || actions) && (
        <div className="section-head">
          {title && <h2>{title}</h2>}
          {actions && <div className="section-actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      {icon && <div className="empty-icon">{icon}</div>}
      <h3>{title}</h3>
      {children && <p className="muted">{children}</p>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

export function Chip({ color, children, className, onClick, active }: { color?: string; children: ReactNode; className?: string; onClick?: () => void; active?: boolean }) {
  const style = color ? ({ '--chip': color } as React.CSSProperties) : undefined;
  const Tag = onClick ? 'button' : 'span';
  return (
    <Tag
      className={cls('chip', color && 'chip-colored', active && 'chip-active', onClick && 'chip-btn', className)}
      style={style}
      onClick={onClick}
      type={onClick ? 'button' : undefined}
    >
      {children}
    </Tag>
  );
}

export function Tabs<T extends string>({
  value,
  onChange,
  tabs,
}: {
  value: T;
  onChange: (v: T) => void;
  tabs: Array<{ id: T; label: ReactNode }>;
}) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          className={cls('tab', value === t.id && 'tab-active')}
          onClick={() => onChange(t.id)}
          type="button"
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ── Formulaires ─────────────────────────────────────────────────────────────

export function Field({ label, hint, children, className }: { label?: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cls('field', className)}>
      {label && <span className="field-label">{label}</span>}
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function TextInput({
  value,
  onChange,
  className,
  ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> & { value: string; onChange: (v: string) => void }) {
  return <input className={cls('input', className)} value={value} onChange={(e) => onChange(e.target.value)} {...rest} />;
}

export function NumberInput({
  value,
  onChange,
  min,
  max,
  className,
  ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> & {
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <input
      className={cls('input', className)}
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={value ?? ''}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === '') return onChange(null);
        const n = Number(raw);
        if (!Number.isNaN(n)) onChange(n);
      }}
      {...rest}
    />
  );
}

export function TextArea({
  value,
  onChange,
  className,
  minRows = 3,
  ...rest
}: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'value'> & {
  value: string;
  onChange: (v: string) => void;
  minRows?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={minRows}
      className={cls('input textarea', className)}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      {...rest}
    />
  );
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  className,
  placeholder,
}: {
  value: T | '';
  onChange: (v: T | '') => void;
  options: Array<{ value: T; label: string; group?: string }>;
  className?: string;
  placeholder?: string;
}) {
  const groups = new Map<string, typeof options>();
  for (const o of options) {
    const g = o.group ?? '';
    groups.set(g, [...(groups.get(g) ?? []), o]);
  }
  return (
    <select className={cls('input select', className)} value={value} onChange={(e) => onChange(e.target.value as T | '')}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {[...groups.entries()].map(([g, opts]) =>
        g ? (
          <optgroup key={g} label={g}>
            {opts.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </optgroup>
        ) : (
          opts.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))
        ),
      )}
    </select>
  );
}

export function ColorSwatches({ value, onChange, colors }: { value: string; onChange: (c: string) => void; colors: string[] }) {
  return (
    <div className="swatches" role="radiogroup">
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={c}
          className={cls('swatch', value === c && 'swatch-active')}
          style={{ background: c }}
          onClick={() => onChange(c)}
        >
          {value === c && <Check size={14} color="#fff" />}
        </button>
      ))}
    </div>
  );
}

/** Étiquettes libres : saisie + Entrée / virgule pour ajouter. */
export function TagInput({ value, onChange, suggestions = [] }: { value: string[]; onChange: (v: string[]) => void; suggestions?: string[] }) {
  const [draft, setDraft] = useState('');
  const listId = useId();
  const add = (raw: string) => {
    const t = raw.trim().replace(/^#/, '');
    if (t && !value.some((v) => v.toLowerCase() === t.toLowerCase())) onChange([...value, t]);
    setDraft('');
  };
  return (
    <div className="taginput">
      {value.map((t) => (
        <span key={t} className="chip chip-tag">
          {t}
          <button type="button" aria-label={`Retirer ${t}`} onClick={() => onChange(value.filter((v) => v !== t))}>
            <X size={12} />
          </button>
        </span>
      ))}
      <input
        className="taginput-field"
        value={draft}
        list={listId}
        placeholder={value.length ? '' : 'Ajouter une étiquette…'}
        onChange={(e) => {
          const v = e.target.value;
          if (v.endsWith(',')) add(v.slice(0, -1));
          else setDraft(v);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add(draft);
          } else if (e.key === 'Backspace' && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => draft && add(draft)}
      />
      <datalist id={listId}>
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  );
}

// ── Fenêtres ────────────────────────────────────────────────────────────────

export function Modal({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cls('modal', wide && 'modal-wide')} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h2>{title}</h2>
          <IconButton label="Fermer" onClick={onClose}>
            <X size={20} />
          </IconButton>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  danger?: boolean;
  hidden?: boolean;
}

export function Menu({
  items,
  label = 'Plus d’actions',
  trigger,
  align = 'right',
}: {
  items: MenuItem[];
  label?: string;
  trigger?: ReactNode;
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const visible = items.filter((i) => !i.hidden);
  return (
    <div className="menu" ref={ref}>
      {trigger ? (
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open}>
          {trigger}
          <ChevronDown size={14} />
        </button>
      ) : (
        <IconButton label={label} onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open}>
          <MoreHorizontal size={20} />
        </IconButton>
      )}
      {open && (
        <div className={cls('menu-pop', align === 'left' && 'menu-left')} role="menu">
          {visible.map((it, i) => (
            <button
              key={i}
              type="button"
              role="menuitem"
              className={cls('menu-item', it.danger && 'menu-danger')}
              onClick={() => {
                setOpen(false);
                it.onClick();
              }}
            >
              {it.icon}
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Hôtes globaux : toasts et confirmation ───────────────────────────────────

export function UiHosts() {
  const toasts = useUi((s) => s.toasts);
  const dismiss = useUi((s) => s.dismissToast);
  const req = useUi((s) => s.confirmReq);
  const close = useUi((s) => s.closeConfirm);
  return (
    <>
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={cls('toast', `toast-${t.tone}`)}>
            <span>{t.text}</span>
            {t.action && (
              <button
                type="button"
                className="toast-action"
                onClick={() => {
                  t.action?.run();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
      {req && (
        <Modal
          title={req.title}
          onClose={() => close(false)}
          footer={
            <>
              <Button variant="ghost" onClick={() => close(false)}>
                Annuler
              </Button>
              <Button variant={req.danger ? 'danger' : 'primary'} onClick={() => close(true)} autoFocus>
                {req.confirmLabel ?? 'Confirmer'}
              </Button>
            </>
          }
        >
          {req.message && <p>{req.message}</p>}
        </Modal>
      )}
    </>
  );
}
