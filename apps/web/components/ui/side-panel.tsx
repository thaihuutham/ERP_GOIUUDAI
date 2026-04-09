'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { ReactNode, useEffect } from 'react';

interface SidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function SidePanel({ isOpen, onClose, title, children }: SidePanelProps) {
  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="side-panel-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, pointerEvents: 'auto' }}
            exit={{ opacity: 0, pointerEvents: 'none' }}
            onClick={onClose}
          />
          <motion.div
            className="side-panel-container"
            initial={{ x: '100%' }}
            animate={{ x: 0, pointerEvents: 'auto' }}
            exit={{ x: '100%', pointerEvents: 'none' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          >
            <div className="side-panel-header">
              <h2 className="side-panel-title">{title}</h2>
              <button
                className="btn-ghost"
                style={{ padding: '4px' }}
                onClick={onClose}
                aria-label="Đóng"
              >
                <X size={20} />
              </button>
            </div>
            <div className="side-panel-body">
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
