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

interface BudgetData {
  totalAvailable: number;
  totalAllocated: number;
  totalSpent: number;
  envelopes: Envelope[];
  transactions: Transaction[];
}

interface BudgetPlannerProps {
  onNavigate?: (view: string) => void;
  darkMode?: boolean;
}

const BudgetPlanner: React.FC<BudgetPlannerProps> = ({ onNavigate, darkMode = false }) => {
  const [budgetData, setBudgetData] = useState<BudgetData>({
    totalAvailable: 0,
    totalAllocated: 0,
    totalSpent: 0,
    envelopes: [],
    transactions: [],
  });
  const [loading, setLoading] = useState(true);
  const [showIncomeModal, setShowIncomeModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [selectedEnvelope, setSelectedEnvelope] = useState<string | null>(null);
  const [incomeAmount, setIncomeAmount] = useState('');
  const [expenseData, setExpenseData] = useState({ amount: '', description: '' });

  const currentMonth = new Date().toLocaleString('es', { month: 'long', year: 'numeric' });
  const bgColor = darkMode ? 'bg-gray-950' : 'bg-white';
  const textColor = darkMode ? 'text-gray-100' : 'text-gray-800';
  const borderColor = darkMode ? 'border-gray-700' : 'border-gray-200';
  const labelColor = darkMode ? 'text-gray-400' : 'text-gray-600';

  useEffect(() => {
    loadBudgetData();
  }, []);

  const loadBudgetData = async () => {
    try {
      setLoading(true);
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setLoading(false);
        return;
      }

      let envelopes: Envelope[] = [];
      let transactions: Transaction[] = [];

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
      const incomeTransactions = transactions.filter(t => t.type === 'income');
      const totalIncome = incomeTransactions.reduce((sum, t) => sum + t.amount, 0);
      const totalAvailable = totalIncome - totalSpent;

      setBudgetData({
        totalAvailable,
        totalAllocated,
        totalSpent,
        envelopes,
        transactions,
      });
    } catch (error) {
      console.error('Error loading budget data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddIncome = async () => {
    if (!incomeAmount || isNaN(Number(incomeAmount))) return;

    try {
      const amount = Number(incomeAmount);
      if (amount <= 0) {
        alert('El monto debe ser mayor a 0');
        return;
      }

      const now = new Date().toISOString().split('T')[0];
      await addDoc(collection(db, 'budget_transactions'), {
        date: now,
        description: 'Ingreso',
        category: 'Ingresos',
        type: 'income',
        amount: amount,
        timestamp: new Date().toISOString(),
      });

      setIncomeAmount('');
      setShowIncomeModal(false);
      loadBudgetData();
    } catch (error) {
      console.error('Error adding income:', error);
      alert('Error al agregar ingreso. Por favor, intenta de nuevo.');
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
        <div className="flex items-center justify-between mb-4">
          <h1 className={`text-2xl font-bold ${textColor}`}>Planificador - {currentMonth.charAt(0).toUpperCase() + currentMonth.slice(1)}</h1>
          <button
            onClick={() => setShowIncomeModal(true)}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors"
          >
            <Plus size={20} />
            AÑADIR INGRESO
          </button>
        </div>

        {/* Available Income Card */}
        <div className={`rounded-lg border ${borderColor} p-4 ${darkMode ? 'bg-gray-800' : 'bg-gray-50'}`}>
          <p className={`text-sm font-medium ${labelColor} mb-1`}>Ingresos Disponibles</p>
          <p className="text-4xl font-bold text-green-600">R$ {budgetData.totalAvailable.toFixed(2)}</p>
          <div className="flex gap-6 mt-3 text-sm">
            <div>
              <p className={labelColor}>Total Ingresado</p>
              <p className={`font-semibold ${textColor}`}>R$ {budgetData.totalAllocated.toFixed(2)}</p>
            </div>
            <div>
              <p className={labelColor}>Total Gastado</p>
              <p className={`font-semibold ${textColor}`}>R$ {budgetData.totalSpent.toFixed(2)}</p>
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

      {/* Add Income Modal */}
      {showIncomeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className={`${bgColor} rounded-lg p-6 max-w-sm w-full border ${borderColor}`}>
            <h3 className={`text-xl font-bold ${textColor} mb-4`}>Añadir Ingreso</h3>
            <div className="space-y-4">
              <div>
                <label className={`block text-sm font-medium ${labelColor} mb-1`}>Monto (R$)</label>
                <input
                  type="number"
                  value={incomeAmount}
                  onChange={e => setIncomeAmount(e.target.value)}
                  placeholder="0.00"
                  className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-800 border-gray-600 text-gray-100' : 'bg-white border-gray-300'}`}
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowIncomeModal(false)}
                  className={`flex-1 px-4 py-2 rounded-lg border ${borderColor} ${textColor} hover:${darkMode ? 'bg-gray-800' : 'bg-gray-50'} transition-colors`}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleAddIncome}
                  className="flex-1 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white transition-colors font-medium"
                >
                  Añadir
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
