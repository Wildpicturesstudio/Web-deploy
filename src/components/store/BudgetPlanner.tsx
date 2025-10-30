import React, { useState, useEffect } from 'react';
import { db } from '../../utils/firebaseClient';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy } from 'firebase/firestore';
import { Plus, Trash2, DollarSign } from 'lucide-react';

interface Envelope {
  id: string;
  name: string;
  percentage: number;
  allocated: number;
  spent: number;
  available: number;
}

interface Transaction {
  id: string;
  date: string;
  description: string;
  category: string;
  type: 'income' | 'expense';
  amount: number;
  envelopeId?: string;
}

interface Contract {
  id: string;
  clientName?: string;
  totalAmount?: number;
  finalPaymentPaid?: boolean;
  eventCompleted?: boolean;
  contractDate?: string;
  eventDate?: string;
  createdAt?: string;
  services?: any[];
  formSnapshot?: { cartItems?: any[] };
  storeItems?: any[];
  travelFee?: number;
}

interface BudgetData {
  totalIncome: number;
  totalAvailable: number;
  totalAllocated: number;
  totalSpent: number;
  envelopes: Envelope[];
  transactions: Transaction[];
  paidContracts: Contract[];
}

interface BudgetPlannerProps {
  onNavigate?: (view: string) => void;
  darkMode?: boolean;
}

const BudgetPlanner: React.FC<BudgetPlannerProps> = ({ onNavigate, darkMode = false }) => {
  const [budgetData, setBudgetData] = useState<BudgetData>({
    totalIncome: 0,
    totalAvailable: 0,
    totalAllocated: 0,
    totalSpent: 0,
    envelopes: [],
    transactions: [],
    paidContracts: [],
  });
  const [loading, setLoading] = useState(true);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [selectedEnvelope, setSelectedEnvelope] = useState<string | null>(null);
  const [expenseData, setExpenseData] = useState({ amount: '', description: '' });

  const currentMonth = new Date().toLocaleString('es', { month: 'long', year: 'numeric' });
  const bgColor = darkMode ? 'bg-gray-950' : 'bg-white';
  const textColor = darkMode ? 'text-gray-100' : 'text-gray-800';
  const borderColor = darkMode ? 'border-gray-700' : 'border-gray-200';
  const labelColor = darkMode ? 'text-gray-400' : 'text-gray-600';

  useEffect(() => {
    loadBudgetData();
  }, []);

  const contractAmounts = (c: Contract) => {
    const svcList: any[] = Array.isArray(c.services) && c.services.length ? c.services : (Array.isArray(c.formSnapshot?.cartItems) ? c.formSnapshot.cartItems : []);
    const servicesTotalRaw = svcList.reduce((sum, it: any) => {
      const qty = Number(it?.quantity ?? 1);
      const price = Number(String(it?.price || '').replace(/[^0-9]/g, ''));
      return sum + (price * qty);
    }, 0);
    const storeTotal = (Array.isArray(c.storeItems) ? c.storeItems : []).reduce((sum: number, it: any) => sum + (Number(it.price) * Number(it.quantity || 1)), 0);
    const travel = Number(c.travelFee || 0);
    const totalFromDoc = Number(c.totalAmount || 0);
    const services = servicesTotalRaw > 0 ? servicesTotalRaw : Math.max(0, totalFromDoc - storeTotal - travel);
    const total = Math.round(services + storeTotal + travel);
    return total;
  };

  const loadBudgetData = async () => {
    try {
      setLoading(true);
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setLoading(false);
        return;
      }

      let envelopes: Envelope[] = [];
      let transactions: Transaction[] = [];
      let paidContracts: Contract[] = [];
      let totalIncome = 0;

      try {
        const contractsSnap = await getDocs(collection(db, 'contracts'));
        const allContracts = contractsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Contract));

        // Filter for paid contracts (either finalPaymentPaid or eventCompleted)
        paidContracts = allContracts.filter(c => c.finalPaymentPaid === true || c.eventCompleted === true);

        // Calculate total income from paid contracts
        totalIncome = paidContracts.reduce((sum, c) => sum + contractAmounts(c), 0);
      } catch (contractError) {
        console.warn('Error loading contracts:', contractError);
      }

      try {
        const envelopesSnap = await getDocs(collection(db, 'budget_envelopes'));
        envelopes = envelopesSnap.docs.map(d => {
          const data = d.data();
          return {
            id: d.id,
            name: data.name || '',
            percentage: data.percentage || 0,
            allocated: data.allocated || 0,
            spent: data.spent || 0,
            available: (data.allocated || 0) - (data.spent || 0),
          } as Envelope;
        });
      } catch (envelopeError) {
        console.warn('Error loading envelopes:', envelopeError);
      }

      try {
        const transactionsSnap = await getDocs(query(collection(db, 'budget_transactions'), orderBy('date', 'desc')));
        transactions = transactionsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Transaction));
      } catch (transactionError) {
        console.warn('Error loading transactions:', transactionError);
      }

      const totalAllocated = envelopes.reduce((sum, e) => sum + e.allocated, 0);
      const totalSpent = envelopes.reduce((sum, e) => sum + e.spent, 0);
      const totalAvailable = totalIncome - totalSpent;

      setBudgetData({
        totalIncome,
        totalAvailable,
        totalAllocated,
        totalSpent,
        envelopes,
        transactions,
        paidContracts,
      });
    } catch (error) {
      console.error('Error loading budget data:', error);
    } finally {
      setLoading(false);
    }
  };


  const handleAddExpense = async () => {
    if (!expenseData.amount || !selectedEnvelope || isNaN(Number(expenseData.amount))) return;

    try {
      const amount = Number(expenseData.amount);
      if (amount <= 0) {
        alert('El monto debe ser mayor a 0');
        return;
      }

      const envelope = budgetData.envelopes.find(e => e.id === selectedEnvelope);
      if (!envelope) {
        alert('Sobre presupuestario no encontrado');
        return;
      }

      const now = new Date().toISOString().split('T')[0];

      await addDoc(collection(db, 'budget_transactions'), {
        date: now,
        description: expenseData.description || 'Gasto',
        category: envelope.name,
        type: 'expense',
        amount: amount,
        envelopeId: selectedEnvelope,
        timestamp: new Date().toISOString(),
      });

      const newSpent = envelope.spent + amount;
      await updateDoc(doc(db, 'budget_envelopes', selectedEnvelope), { spent: newSpent });

      setExpenseData({ amount: '', description: '' });
      setShowExpenseModal(false);
      setSelectedEnvelope(null);
      loadBudgetData();
    } catch (error) {
      console.error('Error adding expense:', error);
      alert('Error al agregar gasto. Por favor, intenta de nuevo.');
    }
  };

  const handleDeleteTransaction = async (id: string) => {
    if (!confirm('¿Estás seguro de que deseas eliminar esta transacción?')) return;

    try {
      const transaction = budgetData.transactions.find(t => t.id === id);
      if (transaction && transaction.envelopeId && transaction.type === 'expense') {
        const envelope = budgetData.envelopes.find(e => e.id === transaction.envelopeId);
        if (envelope) {
          const newSpent = Math.max(0, envelope.spent - transaction.amount);
          await updateDoc(doc(db, 'budget_envelopes', transaction.envelopeId), { spent: newSpent });
        }
      }

      await deleteDoc(doc(db, 'budget_transactions', id));
      loadBudgetData();
    } catch (error) {
      console.error('Error deleting transaction:', error);
      alert('Error al eliminar la transacción. Por favor, intenta de nuevo.');
    }
  };

  const getProgressColor = (percentage: number) => {
    if (percentage < 50) return 'bg-green-500';
    if (percentage < 80) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className={darkMode ? 'text-gray-400' : 'text-gray-600'}>Cargando datos presupuestarios...</p>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${darkMode ? 'bg-black' : ''}`}>
      {/* Header Section */}
      <div className={`${bgColor} rounded-lg border ${borderColor} p-6 shadow-sm`}>
        <h1 className={`text-2xl font-bold ${textColor} mb-4`}>Planificador - {currentMonth.charAt(0).toUpperCase() + currentMonth.slice(1)}</h1>

        {/* Cards Grid - Side by Side and Smaller */}
        <div className="grid grid-cols-2 gap-3">
          {/* Income from Paid Contracts */}
          <div className={`rounded-lg border ${borderColor} p-2 ${darkMode ? 'bg-gray-800' : 'bg-gray-50'}`}>
            <p className={`text-xs font-medium ${labelColor} mb-0.5`}>Ingresos (de Contratos Pagados)</p>
            <p className="text-lg font-bold text-green-600">R$ {budgetData.totalIncome.toFixed(2)}</p>
            <p className={`text-xs ${labelColor} mt-1`}>{budgetData.paidContracts.length} contrato(s) pagado(s)</p>
          </div>

          {/* Available Income Card */}
          <div className={`rounded-lg border ${borderColor} p-2 ${darkMode ? 'bg-gray-800' : 'bg-gray-50'}`}>
            <p className={`text-xs font-medium ${labelColor} mb-0.5`}>Ingresos Disponibles (Saldo)</p>
            <p className="text-lg font-bold text-blue-600">R$ {budgetData.totalAvailable.toFixed(2)}</p>
            <div className="mt-2 text-xs space-y-0.5">
              <div className="flex justify-between">
                <span className={labelColor}>Asignado:</span>
                <span className={`font-semibold ${textColor}`}>R$ {budgetData.totalAllocated.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className={labelColor}>Gastado:</span>
                <span className={`font-semibold ${textColor}`}>R$ {budgetData.totalSpent.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Envelopes Grid */}
      <div>
        <h2 className={`text-xl font-bold ${textColor} mb-4`}>Sobres Presupuestarios</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {budgetData.envelopes.length > 0 ? (
            budgetData.envelopes.map(envelope => {
              const progressPercent = envelope.allocated > 0 ? (envelope.spent / envelope.allocated) * 100 : 0;
              return (
                <div key={envelope.id} className={`${bgColor} rounded-lg border ${borderColor} p-4 shadow-sm`}>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className={`font-bold ${textColor}`}>{envelope.name}</h3>
                      <p className={`text-sm ${labelColor}`}>Asignado: {envelope.percentage}%</p>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                      <DollarSign className="text-blue-600" size={16} />
                    </div>
                  </div>

                  <div className="space-y-2 mb-3 text-sm">
                    <div className="flex justify-between">
                      <span className={labelColor}>Monto:</span>
                      <span className={`font-semibold ${textColor}`}>R$ {envelope.allocated.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className={labelColor}>Gastado:</span>
                      <span className={`font-semibold ${textColor}`}>R$ {envelope.spent.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-gray-200">
                      <span className={`font-bold ${textColor}`}>DISPONIBLE:</span>
                      <span className={`text-lg font-bold ${envelope.available >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        R$ {envelope.available.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="mb-4">
                    <div className={`w-full bg-gray-200 rounded-full h-2 ${darkMode ? 'bg-gray-700' : ''}`}>
                      <div
                        className={`h-2 rounded-full transition-all ${getProgressColor(progressPercent)}`}
                        style={{ width: `${Math.min(progressPercent, 100)}%` }}
                      ></div>
                    </div>
                    <p className={`text-xs ${labelColor} mt-1 text-right`}>{progressPercent.toFixed(0)}%</p>
                  </div>

                  <button
                    onClick={() => {
                      setSelectedEnvelope(envelope.id);
                      setShowExpenseModal(true);
                    }}
                    className="w-full flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-700 text-white px-3 py-2 rounded transition-colors text-sm font-medium"
                  >
                    AÑADIR GASTO
                  </button>
                </div>
              );
            })
          ) : (
            <p className={`col-span-full text-center py-8 ${labelColor}`}>Sin sobres presupuestarios configurados</p>
          )}
        </div>
      </div>

      {/* Transaction History */}
      <div>
        <h2 className={`text-xl font-bold ${textColor} mb-4`}>Historial de Transacciones</h2>
        <div className={`${bgColor} rounded-lg border ${borderColor} overflow-hidden shadow-sm`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className={`${darkMode ? 'bg-gray-800' : 'bg-gray-50'} border-b ${borderColor}`}>
                  <th className={`px-4 py-3 text-left font-semibold ${labelColor}`}>Fecha</th>
                  <th className={`px-4 py-3 text-left font-semibold ${labelColor}`}>Descripción</th>
                  <th className={`px-4 py-3 text-left font-semibold ${labelColor}`}>Categoría</th>
                  <th className={`px-4 py-3 text-left font-semibold ${labelColor}`}>Tipo</th>
                  <th className={`px-4 py-3 text-right font-semibold ${labelColor}`}>Monto</th>
                  <th className={`px-4 py-3 text-center font-semibold ${labelColor}`}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {budgetData.transactions.length > 0 ? (
                  budgetData.transactions.map(transaction => (
                    <tr key={transaction.id} className={`border-b ${borderColor} hover:${darkMode ? 'bg-gray-800' : 'bg-gray-50'}`}>
                      <td className={`px-4 py-3 ${textColor}`}>{new Date(transaction.date).toLocaleDateString('es')}</td>
                      <td className={`px-4 py-3 ${textColor}`}>{transaction.description}</td>
                      <td className={`px-4 py-3 ${textColor}`}>{transaction.category}</td>
                      <td className={`px-4 py-3`}>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          transaction.type === 'income'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-orange-100 text-orange-700'
                        }`}>
                          {transaction.type === 'income' ? 'Ingreso' : 'Gasto'}
                        </span>
                      </td>
                      <td className={`px-4 py-3 text-right font-semibold ${transaction.type === 'income' ? 'text-green-600' : 'text-orange-600'}`}>
                        {transaction.type === 'income' ? '+' : '-'} R$ {transaction.amount.toFixed(2)}
                      </td>
                      <td className={`px-4 py-3 text-center`}>
                        <button
                          onClick={() => handleDeleteTransaction(transaction.id)}
                          className="text-red-600 hover:text-red-700 transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className={`px-4 py-8 text-center ${labelColor}`}>
                      Sin transacciones registradas
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Add Expense Modal */}
      {showExpenseModal && selectedEnvelope && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className={`${bgColor} rounded-lg p-6 max-w-sm w-full border ${borderColor}`}>
            <h3 className={`text-xl font-bold ${textColor} mb-4`}>Añadir Gasto</h3>
            <p className={`text-sm ${labelColor} mb-4`}>
              Sobre: <span className={`font-semibold ${textColor}`}>{budgetData.envelopes.find(e => e.id === selectedEnvelope)?.name}</span>
            </p>
            <div className="space-y-4">
              <div>
                <label className={`block text-sm font-medium ${labelColor} mb-1`}>Descripción (opcional)</label>
                <input
                  type="text"
                  value={expenseData.description}
                  onChange={e => setExpenseData({ ...expenseData, description: e.target.value })}
                  placeholder="Descripción del gasto"
                  className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-800 border-gray-600 text-gray-100' : 'bg-white border-gray-300'}`}
                />
              </div>
              <div>
                <label className={`block text-sm font-medium ${labelColor} mb-1`}>Monto (R$)</label>
                <input
                  type="number"
                  value={expenseData.amount}
                  onChange={e => setExpenseData({ ...expenseData, amount: e.target.value })}
                  placeholder="0.00"
                  className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-800 border-gray-600 text-gray-100' : 'bg-white border-gray-300'}`}
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowExpenseModal(false);
                    setSelectedEnvelope(null);
                    setExpenseData({ amount: '', description: '' });
                  }}
                  className={`flex-1 px-4 py-2 rounded-lg border ${borderColor} ${textColor} hover:${darkMode ? 'bg-gray-800' : 'bg-gray-50'} transition-colors`}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleAddExpense}
                  className="flex-1 px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white transition-colors font-medium"
                >
                  Añadir
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BudgetPlanner;
