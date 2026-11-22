import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import usePresence from '../../hooks/usePresence';

export default function ModalWrapper({ isOpen, onClose, title, icon: Icon, children, footer, maxWidth = "max-w-[480px]" }) {
  const { mounted, state } = usePresence(isOpen, 140);

  if (!mounted) return null;
  const isClosing = state === 'exit';

  return createPortal(
    <>
      <div 
        className={`fixed inset-0 z-[2000] bg-black/60 transition-opacity duration-200 ${isClosing ? 'opacity-0' : 'opacity-100'}`} 
        onClick={onClose} 
      />
      <div className="fixed inset-0 z-[2100] flex items-center justify-center p-4 pb-24 sm:pb-6 pointer-events-none">
        <div 
          className={`bg-white dark:bg-zinc-900 border border-black/10 dark:border-white/10 rounded-2xl shadow-2xl w-full ${maxWidth} overflow-hidden flex flex-col pointer-events-auto ${isClosing ? 'animate-pop-out' : 'animate-pop-in'}`}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-800/20">
            <div className="flex items-center gap-3">
              {Icon && (
                <div className="w-8 h-8 rounded-full bg-zinc-200/50 dark:bg-zinc-800 flex items-center justify-center text-zinc-700 dark:text-zinc-200">
                  <Icon size={16} strokeWidth={2.5} />
                </div>
              )}
              <h2 className="text-[15px] font-bold text-zinc-900 dark:text-zinc-100">{title}</h2>
            </div>
            <button 
              onClick={onClose} 
              className="w-8 h-8 flex items-center justify-center rounded-full text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
          
          {/* Content */}
          <div className="p-6 overflow-y-auto max-h-[60vh]">
            {children}
          </div>

          {/* Footer */}
          {footer && (
            <div className="p-4 px-6 border-t border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-800/20 flex justify-end gap-2">
              {footer}
            </div>
          )}
        </div>
      </div>
    </>,
    document.body
  );
}
