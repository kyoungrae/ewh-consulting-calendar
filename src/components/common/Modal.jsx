import { useEffect } from 'react';
import { X } from 'lucide-react';

export default function Modal({ isOpen, onClose, title, children, size = 'md', className = '' }) {
    useEffect(() => {
        if (isOpen) {
            document.body.classList.add('modal-open');
        } else {
            // 다른 열려있는 모달이 있는지 체크 (선택사항이나 안전을 위해)
            const openModals = document.querySelectorAll('.modal-overlay').length;
            if (openModals <= 1) {
                document.body.classList.remove('modal-open');
            }
        }

        return () => {
            const openModals = document.querySelectorAll('.modal-overlay').length;
            if (openModals <= 1) {
                document.body.classList.remove('modal-open');
            }
        };
    }, [isOpen]);

    if (!isOpen) return null;

    const sizeClasses = {
        sm: 'max-w-sm',
        md: 'max-w-md',
        lg: 'max-w-lg',
        xl: 'max-w-xl'
    };

    return (
        <div className={`modal-overlay ${className ? className + '-overlay' : ''}`} onClick={onClose}>
            <div
                className={`modal ${sizeClasses[size]} w-full ${className}`}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="modal-header">
                    <h3 className="modal-title">{title}</h3>
                    <button onClick={onClose} className="modal-close">
                        <X size={20} />
                    </button>
                </div>
                <div className="modal-body">
                    {children}
                </div>
            </div>
        </div>
    );
}
