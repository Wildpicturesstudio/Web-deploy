import { useState, useRef } from 'react';
import { DollarSign, CheckCircle, Pencil, Flag } from 'lucide-react';

interface WorkflowStatusButtonsProps {
  depositPaid?: boolean;
  finalPaymentPaid?: boolean;
  isEditing?: boolean;
  eventCompleted?: boolean;
  onUpdate: (updates: {
    depositPaid?: boolean;
    finalPaymentPaid?: boolean;
    isEditing?: boolean;
    eventCompleted?: boolean;
  }) => Promise<void> | void;
  disabled?: boolean;
}

export const WorkflowStatusButtons: React.FC<WorkflowStatusButtonsProps> = ({
  depositPaid = false,
  finalPaymentPaid = false,
  isEditing = false,
  eventCompleted = false,
  onUpdate,
  disabled = false,
}) => {
  const [tooltipVisible, setTooltipVisible] = useState<string | null>(null);
  const [updatingButton, setUpdatingButton] = useState<string | null>(null);
  const tooltipTimers = useRef<Record<string, NodeJS.Timeout>>({});

  const statusButtons = [
    {
      id: 'deposit',
      label: 'Depósito Realizado',
      icon: DollarSign,
      active: depositPaid,
      onClick: async () => {
        setUpdatingButton('deposit');
        try {
          await onUpdate({ depositPaid: !depositPaid });
        } finally {
          setUpdatingButton(null);
        }
      },
    },
    {
      id: 'payment',
      label: 'Evento Pago',
      icon: CheckCircle,
      active: finalPaymentPaid,
      onClick: async () => {
        setUpdatingButton('payment');
        try {
          await onUpdate({ finalPaymentPaid: !finalPaymentPaid });
        } finally {
          setUpdatingButton(null);
        }
      },
    },
    {
      id: 'editing',
      label: 'Editando',
      icon: Pencil,
      active: isEditing,
      onClick: async () => {
        setUpdatingButton('editing');
        try {
          await onUpdate({ isEditing: !isEditing });
        } finally {
          setUpdatingButton(null);
        }
      },
    },
    {
      id: 'completed',
      label: 'Terminado',
      icon: Flag,
      active: eventCompleted,
      onClick: async () => {
        setUpdatingButton('completed');
        try {
          await onUpdate({ eventCompleted: !eventCompleted });
        } finally {
          setUpdatingButton(null);
        }
      },
    },
  ];

  const allActive = depositPaid && finalPaymentPaid && isEditing && eventCompleted;

  const handleMouseEnter = (buttonId: string) => {
    if (tooltipTimers.current[buttonId]) {
      clearTimeout(tooltipTimers.current[buttonId]);
    }
    tooltipTimers.current[buttonId] = setTimeout(() => {
      setTooltipVisible(buttonId);
    }, 2000);
  };

  const handleMouseLeave = (buttonId: string) => {
    if (tooltipTimers.current[buttonId]) {
      clearTimeout(tooltipTimers.current[buttonId]);
      delete tooltipTimers.current[buttonId];
    }
    setTooltipVisible(null);
  };

  if (allActive) {
    return (
      <div className="flex items-center justify-center px-3 py-2">
        <div className="text-sm font-semibold text-green-600 flex items-center gap-2">
          <CheckCircle size={16} />
          Evento completado
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {statusButtons.map((btn) => {
        const Icon = btn.icon;
        const isLoading = updatingButton === btn.id;

        return (
          <div key={btn.id} className="relative">
            <button
              onClick={btn.onClick}
              disabled={disabled || isLoading}
              onMouseEnter={() => handleMouseEnter(btn.id)}
              onMouseLeave={() => handleMouseLeave(btn.id)}
              className={`p-2 rounded-lg transition-all duration-200 ${
                btn.active
                  ? 'bg-green-100 text-green-600 border border-green-300'
                  : 'bg-gray-100 text-gray-600 border border-gray-300 hover:bg-gray-200'
              } ${disabled || isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              title={btn.label}
            >
              {isLoading ? (
                <div className="animate-spin">
                  <Icon size={18} />
                </div>
              ) : (
                <Icon size={18} />
              )}
            </button>

            {/* Tooltip */}
            {tooltipVisible === btn.id && (
              <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 whitespace-nowrap z-10">
                <div className="bg-gray-800 text-white px-3 py-1 rounded-md text-xs font-medium">
                  {btn.label}
                  <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-gray-800" />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
