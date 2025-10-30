import React, { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where } from 'firebase/firestore';
import { db } from '../utils/firebaseClient';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Edit2, Trash2, TrendingUp, AlertCircle, DollarSign, Target, Eye, EyeOff } from 'lucide-react';
import { PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts';

interface IncomeItem {
  id: string;
  concept: string;
  type: 'Fijo' | 'Variable';
  amount: number;
}

interface ExpenseItem {
  id: string;
  category: string;
  description: string;
  amount: number;
  isFixed: boolean;
  isCardPayment: boolean;
  isAntExpense: boolean;
}

interface SavingsGoal {
  id: string;
  name: string;
  currentSavings: number;
  targetAmount: number;
  monthsToSave: number;
  interestRate: number;
}

interface FinancialPlannerData {
  userId: string;
  month: number;
  year: number;
  income: IncomeItem[];
  expenses: ExpenseItem[];
  goals: SavingsGoal[];
  createdAt: Date;
  updatedAt: Date;
}

const FinancialPlannerPage: React.FC = () => {
  const { user } = useAuth();
  const [darkMode, setDarkMode] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  
  const [income, setIncome] = useState<IncomeItem[]>([]);
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  
  const [showIncomeModal, setShowIncomeModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [editingIncome, setEditingIncome] = useState<IncomeItem | null>(null);
  const [editingExpense, setEditingExpense] = useState<ExpenseItem | null>(null);
  const [editingGoal, setEditingGoal] = useState<SavingsGoal | null>(null);
  
  const [expenseForm, setExpenseForm] = useState({
    category: '',
    description: '',
    amount: 0,
    isFixed: false,
    isCardPayment: false,
    isAntExpense: false
  });
  
  const [incomeForm, setIncomeForm] = useState<{ concept: string; type: 'Fijo' | 'Variable'; amount: number }>({
    concept: '',
    type: 'Fijo',
    amount: 0
  });
  
  const [goalForm, setGoalForm] = useState({
    name: '',
    currentSavings: 0,
    targetAmount: 0,
    monthsToSave: 12,
    interestRate: 0
  });

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user, currentMonth, currentYear]);

  const loadData = async () => {
    if (!user) return;
    try {
      setLoading(true);
      const monthYear = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
      
      const incomeDocs = await getDocs(
        query(collection(db, `users/${user.uid}/planner_income`), where('monthYear', '==', monthYear))
      );
      setIncome(incomeDocs.docs.map(d => ({ id: d.id, ...d.data() } as IncomeItem)));
      
      const expenseDocs = await getDocs(
        query(collection(db, `users/${user.uid}/planner_expenses`), where('monthYear', '==', monthYear))
      );
      setExpenses(expenseDocs.docs.map(d => ({ id: d.id, ...d.data() } as ExpenseItem)));
      
      const goalsDocs = await getDocs(collection(db, `users/${user.uid}/planner_goals`));
      setGoals(goalsDocs.docs.map(d => ({ id: d.id, ...d.data() } as SavingsGoal)));
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const monthYear = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;

  const addIncome = async () => {
    if (!user || !incomeForm.concept || incomeForm.amount <= 0) return;
    try {
      await addDoc(collection(db, `users/${user.uid}/planner_income`), {
        ...incomeForm,
        monthYear
      });
      setIncomeForm({ concept: '', type: 'Fijo', amount: 0 });
      setShowIncomeModal(false);
      loadData();
    } catch (error) {
      console.error('Error adding income:', error);
    }
  };

  const updateIncome = async (id: string) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, `users/${user.uid}/planner_income`, id), incomeForm);
      setIncomeForm({ concept: '', type: 'Fijo', amount: 0 });
      setEditingIncome(null);
      setShowIncomeModal(false);
      loadData();
    } catch (error) {
      console.error('Error updating income:', error);
    }
  };

  const deleteIncome = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, `users/${user.uid}/planner_income`, id));
      loadData();
    } catch (error) {
      console.error('Error deleting income:', error);
    }
  };

  const addExpense = async () => {
    if (!user || !expenseForm.category || expenseForm.amount <= 0) return;
    try {
      await addDoc(collection(db, `users/${user.uid}/planner_expenses`), {
        ...expenseForm,
        monthYear
      });
      setExpenseForm({
        category: '',
        description: '',
        amount: 0,
        isFixed: false,
        isCardPayment: false,
        isAntExpense: false
      });
      setShowExpenseModal(false);
      loadData();
    } catch (error) {
      console.error('Error adding expense:', error);
    }
  };

  const updateExpense = async (id: string) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, `users/${user.uid}/planner_expenses`, id), expenseForm);
      setExpenseForm({
        category: '',
        description: '',
        amount: 0,
        isFixed: false,
        isCardPayment: false,
        isAntExpense: false
      });
      setEditingExpense(null);
      setShowExpenseModal(false);
      loadData();
    } catch (error) {
      console.error('Error updating expense:', error);
    }
  };

  const deleteExpense = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, `users/${user.uid}/planner_expenses`, id));
      loadData();
    } catch (error) {
      console.error('Error deleting expense:', error);
    }
  };

  const addGoal = async () => {
    if (!user || !goalForm.name || goalForm.targetAmount <= 0) return;
    try {
      await addDoc(collection(db, `users/${user.uid}/planner_goals`), goalForm);
      setGoalForm({
        name: '',
        currentSavings: 0,
        targetAmount: 0,
        monthsToSave: 12,
        interestRate: 0
      });
      setShowGoalModal(false);
      loadData();
    } catch (error) {
      console.error('Error adding goal:', error);
    }
  };

  const updateGoal = async (id: string) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, `users/${user.uid}/planner_goals`, id), goalForm);
      setGoalForm({
        name: '',
        currentSavings: 0,
        targetAmount: 0,
        monthsToSave: 12,
        interestRate: 0
      });
      setEditingGoal(null);
      setShowGoalModal(false);
      loadData();
    } catch (error) {
      console.error('Error updating goal:', error);
    }
  };

  const deleteGoal = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, `users/${user.uid}/planner_goals`, id));
      loadData();
    } catch (error) {
      console.error('Error deleting goal:', error);
    }
  };

  const calculateRequiredMonthlySavings = (targetAmount: number, currentSavings: number, monthsToSave: number, interestRate: number): number => {
    if (monthsToSave <= 0 || targetAmount <= currentSavings) return 0;
    const monthlyRate = interestRate / 100 / 12;
    if (monthlyRate === 0) {
      return (targetAmount - currentSavings) / monthsToSave;
    }
    const remaining = targetAmount - currentSavings;
    const monthlyPayment = remaining / (((Math.pow(1 + monthlyRate, monthsToSave) - 1) / (monthlyRate * Math.pow(1 + monthlyRate, monthsToSave))));
    return monthlyPayment;
  };

  const totalIncome = useMemo(() => income.reduce((sum, item) => sum + item.amount, 0), [income]);
  const totalExpenses = useMemo(() => expenses.reduce((sum, item) => sum + item.amount, 0), [expenses]);
  const availableCash = totalIncome - totalExpenses;
  const antExpensesTotal = useMemo(() => expenses.filter(e => e.isAntExpense).reduce((sum, e) => sum + e.amount, 0), [expenses]);
  const antExpensesBudget = useMemo(() => {
    const totalGoalsRequired = goals.reduce((sum, goal) => sum + calculateRequiredMonthlySavings(goal.targetAmount, goal.currentSavings, goal.monthsToSave, goal.interestRate), 0);
    return Math.max(0, availableCash * 0.1);
  }, [goals, availableCash]);

  const expenseBreakdown = useMemo(() => {
    const breakdown = new Map<string, number>();
    expenses.forEach(exp => {
      breakdown.set(exp.category, (breakdown.get(exp.category) || 0) + exp.amount);
    });
    return Array.from(breakdown.entries()).map(([category, amount]) => ({
      category,
      amount,
      percentage: ((amount / totalExpenses) * 100).toFixed(1)
    }));
  }, [expenses, totalExpenses]);

  const monthlySummaryData = useMemo(() => {
    const monthlyData = new Map<string, { income: number; expenses: number }>();
    const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

    // Initialize all months
    for (let i = 0; i < 12; i++) {
      monthlyData.set(monthNames[i], { income: 0, expenses: 0 });
    }

    // Aggregate income by month
    income.forEach(item => {
      const monthYear = (item as any).monthYear;
      if (monthYear) {
        const month = parseInt(monthYear.split('-')[1]) - 1;
        const existing = monthlyData.get(monthNames[month]) || { income: 0, expenses: 0 };
        existing.income += item.amount;
        monthlyData.set(monthNames[month], existing);
      }
    });

    // Aggregate expenses by month
    expenses.forEach(item => {
      const monthYear = (item as any).monthYear;
      if (monthYear) {
        const month = parseInt(monthYear.split('-')[1]) - 1;
        const existing = monthlyData.get(monthNames[month]) || { income: 0, expenses: 0 };
        existing.expenses += item.amount;
        monthlyData.set(monthNames[month], existing);
      }
    });

    // Convert to array and calculate savings
    return Array.from(monthlyData.entries()).map(([month, data]) => ({
      month,
      Ingresos: data.income,
      Gastos: data.expenses,
      Ahorros: Math.max(0, data.income - data.expenses)
    }));
  }, [income, expenses]);

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  const bgColor = darkMode ? 'bg-gray-900' : 'bg-white';
  const textColor = darkMode ? 'text-white' : 'text-black';
  const labelColor = darkMode ? 'text-white' : 'text-black';
  const borderColor = darkMode ? 'border-gray-700' : 'border-gray-200';
  const buttonStyle = darkMode
    ? 'border-2 border-white bg-gray-900 text-white hover:bg-white hover:text-black'
    : 'border-2 border-black bg-black text-white hover:bg-white hover:text-black';

  if (loading) {
    return <div className="flex items-center justify-center h-screen"><p>Cargando...</p></div>;
  }

  return (
    <div className={`${darkMode ? 'bg-black' : 'bg-gray-50'} min-h-screen`}>
      {/* Sticky Header */}
      <div className={`sticky top-0 z-50 ${bgColor} border-b ${borderColor} shadow-sm`}>
        <div className="max-w-7xl mx-auto px-4 py-1.5">
          <div className="flex items-center justify-end gap-3.75">
            <select
              value={currentMonth}
              onChange={(e) => setCurrentMonth(Number(e.target.value))}
              className={`px-3 py-2 rounded border ${borderColor} ${bgColor} ${textColor}`}
            >
              {['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'].map((month, idx) => (
                <option key={idx} value={idx}>{month}</option>
              ))}
            </select>
            
            <select
              value={currentYear}
              onChange={(e) => setCurrentYear(Number(e.target.value))}
              className={`px-3 py-2 rounded border ${borderColor} ${bgColor} ${textColor}`}
            >
              {[2020, 2021, 2022, 2023, 2024, 2025, 2026].map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 space-y-8" style={{padding: "0 16px 16px"}}>
        {/* SECTION 1: Dashboard Summary */}
        <section className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className={`${bgColor} rounded border ${borderColor} p-2 shadow-sm hover:shadow-md transition-shadow`}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className={`text-xs font-medium ${labelColor} truncate`}>Ingresos Totales</p>
                  <p className={`text-base font-bold ${totalIncome >= 0 ? 'text-green-600' : 'text-red-600'} leading-tight`}>R$ {totalIncome.toFixed(2)}</p>
                </div>
                <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                  <DollarSign className="text-green-600" size={14} />
                </div>
              </div>
            </div>

            <div className={`${bgColor} rounded border ${borderColor} p-2 shadow-sm hover:shadow-md transition-shadow`}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className={`text-xs font-medium ${labelColor} truncate`}>Total de Gastos</p>
                  <p className="text-base font-bold text-orange-600 leading-tight">R$ {totalExpenses.toFixed(2)}</p>
                </div>
                <div className="w-6 h-6 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
                  <TrendingUp className="text-orange-600" size={14} />
                </div>
              </div>
            </div>

            <div className={`${bgColor} rounded border ${borderColor} p-2 shadow-sm hover:shadow-md transition-shadow`}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className={`text-xs font-medium ${labelColor} truncate`}>Disponible</p>
                  <p className={`text-base font-bold ${availableCash >= 0 ? 'text-green-600' : 'text-red-600'} leading-tight`}>R$ {availableCash.toFixed(2)}</p>
                </div>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${availableCash >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
                  {availableCash >= 0 ? (
                    <TrendingUp className="text-green-600" size={14} />
                  ) : (
                    <AlertCircle className="text-red-600" size={14} />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Charts and Summaries */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Donut Chart */}
            <div className={`${bgColor} rounded-lg border ${borderColor} p-6 shadow-sm lg:col-span-1`}>
              <h3 className={`text-lg font-semibold ${textColor} mb-4`}>Desglose de Gastos Mensuales</h3>
              {expenseBreakdown.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={expenseBreakdown} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2} dataKey="amount">
                      {expenseBreakdown.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: any) => `R$ ${Number(value).toFixed(2)}`} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className={labelColor}>Sin gastos registrados</p>
              )}
            </div>

            {/* Savings Goals Chart */}
            <div className={`${bgColor} rounded-lg border ${borderColor} p-6 shadow-sm`}>
              <h3 className={`text-lg font-semibold ${textColor} mb-4`}>Resumen de tus Ahorros</h3>
              {monthlySummaryData.length > 0 && (income.length > 0 || expenses.length > 0) ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={monthlySummaryData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#374151' : '#e5e7eb'} />
                    <XAxis
                      dataKey="month"
                      stroke={labelColor}
                      style={{ fontSize: '12px' }}
                    />
                    <YAxis
                      stroke={labelColor}
                      style={{ fontSize: '12px' }}
                    />
                    <Tooltip
                      formatter={(value) => `R$ ${Number(value).toFixed(2)}`}
                      contentStyle={{
                        backgroundColor: bgColor,
                        border: `1px solid ${borderColor}`,
                        borderRadius: '4px'
                      }}
                      labelStyle={{ color: textColor }}
                    />
                    <Legend
                      wrapperStyle={{ paddingTop: '16px' }}
                      iconType="line"
                    />
                    <Line
                      type="monotone"
                      dataKey="Ingresos"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={{ fill: '#10b981', r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="Gastos"
                      stroke="#ef4444"
                      strokeWidth={2}
                      dot={{ fill: '#ef4444', r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="Ahorros"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      dot={{ fill: '#3b82f6', r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className={labelColor}>Sin datos de ingresos o gastos</p>
              )}
            </div>

            {/* Expense Breakdown by Category */}
            <div className={`${bgColor} rounded-lg border ${borderColor} p-6 shadow-sm`}>
              <h3 className={`text-lg font-semibold ${textColor} mb-4`}>Desglose de gastos</h3>
              {expenses.length > 0 ? (
                <div className="overflow-y-auto max-h-64">
                  <div className="space-y-2">
                    {expenseBreakdown.map((expense, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 rounded border-b" style={{borderColor: borderColor}}>
                        <span className={textColor}>{expense.category}</span>
                        <span className="font-semibold text-green-600">R$ {expense.amount.toFixed(2)}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between p-3 rounded-lg mt-4 font-bold" style={{backgroundColor: darkMode ? '#1f2937' : '#f3f4f6'}}>
                      <span className={textColor}>Total Gastos</span>
                      <span className="text-red-600">R$ {totalExpenses.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <p className={labelColor}>Sin gastos registrados</p>
              )}
            </div>
          </div>
        </section>

        <h2 className={`text-2xl font-bold ${textColor}`} style={{marginTop: "12px"}}>Presupuesto Detallado</h2>

        {/* SECTION 2: Detailed Budget */}
        <section className="space-y-6" style={{marginTop: "32px"}}>
          {/* Income Management */}
          <div className={`${bgColor} rounded-lg border ${borderColor} shadow-sm`} style={{padding: "10px 24px 24px"}}>
            <div className="flex justify-between items-center mb-4">
              <h3 className={`text-lg font-semibold ${textColor}`}>Ingresos Promedio Mensuales</h3>
              <button
                onClick={() => {
                  setEditingIncome(null);
                  setIncomeForm({ concept: '', type: 'Fijo', amount: 0 });
                  setShowIncomeModal(true);
                }}
                className={`flex items-center gap-2 px-3 py-2 rounded-none text-sm font-medium transition-colors ${buttonStyle}`}
              >
                <Plus size={16} /> Añadir Ingreso
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className={`w-full text-sm border-collapse ${darkMode ? 'bg-gray-800' : 'bg-gray-50'}`}>
                <thead>
                  <tr className={`border-b ${borderColor}`}>
                    <th className={`text-left px-4 py-2 font-semibold ${labelColor}`}>Concepto</th>
                    <th className={`text-left px-4 py-2 font-semibold ${labelColor}`}>Tipo</th>
                    <th className={`text-right px-4 py-2 font-semibold ${labelColor}`}>Monto</th>
                    <th className={`text-center px-4 py-2 font-semibold ${labelColor}`}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {income.map(item => (
                    <tr key={item.id} className={`border-b ${borderColor} hover:${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
                      <td className={`px-4 py-2 ${textColor}`}>{item.concept}</td>
                      <td className={`px-4 py-2 ${textColor}`}>{item.type}</td>
                      <td className={`px-4 py-2 text-right ${textColor}`}>R$ {item.amount.toFixed(2)}</td>
                      <td className="px-4 py-2 text-center">
                        <button
                          onClick={() => {
                            setEditingIncome(item);
                            setIncomeForm({ concept: item.concept, type: item.type, amount: item.amount });
                            setShowIncomeModal(true);
                          }}
                          className="text-blue-600 hover:text-blue-800 mr-2"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => deleteIncome(item.id)}
                          className="text-red-600 hover:text-red-800"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Expense Management */}
          <div className={`${bgColor} rounded-lg border ${borderColor} p-6 shadow-sm`}>
            <div className="flex justify-between items-center mb-4">
              <h3 className={`text-lg font-semibold ${textColor}`}>Detalle de Gastos</h3>
              <button
                onClick={() => {
                  setEditingExpense(null);
                  setExpenseForm({
                    category: '',
                    description: '',
                    amount: 0,
                    isFixed: false,
                    isCardPayment: false,
                    isAntExpense: false
                  });
                  setShowExpenseModal(true);
                }}
                className={`flex items-center gap-2 px-3 py-2 rounded-none text-sm font-medium transition-colors ${buttonStyle}`}
              >
                <Plus size={16} /> Añadir Gasto
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className={`w-full text-sm border-collapse ${darkMode ? 'bg-gray-800' : 'bg-gray-50'}`}>
                <thead>
                  <tr className={`border-b ${borderColor}`}>
                    <th className={`text-left px-4 py-2 font-semibold ${labelColor}`}>Categoría</th>
                    <th className={`text-left px-4 py-2 font-semibold ${labelColor}`}>Descripción</th>
                    <th className={`text-right px-4 py-2 font-semibold ${labelColor}`}>Monto</th>
                    <th className={`text-center px-4 py-2 font-semibold ${labelColor}`}>Fijo</th>
                    <th className={`text-center px-4 py-2 font-semibold ${labelColor}`}>Tarjeta</th>
                    <th className={`text-center px-4 py-2 font-semibold ${labelColor}`}>Hormiga</th>
                    <th className={`text-center px-4 py-2 font-semibold ${labelColor}`}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map(item => (
                    <tr key={item.id} className={`border-b ${borderColor} hover:${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
                      <td className={`px-4 py-2 ${textColor}`}>{item.category}</td>
                      <td className={`px-4 py-2 ${textColor}`}>{item.description}</td>
                      <td className={`px-4 py-2 text-right ${textColor}`}>R$ {item.amount.toFixed(2)}</td>
                      <td className="px-4 py-2 text-center">{item.isFixed ? '✓' : ''}</td>
                      <td className="px-4 py-2 text-center">{item.isCardPayment ? '✓' : ''}</td>
                      <td className="px-4 py-2 text-center">{item.isAntExpense ? '🐜' : ''}</td>
                      <td className="px-4 py-2 text-center">
                        <button
                          onClick={() => {
                            setEditingExpense(item);
                            setExpenseForm(item);
                            setShowExpenseModal(true);
                          }}
                          className="text-blue-600 hover:text-blue-800 mr-2"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => deleteExpense(item.id)}
                          className="text-red-600 hover:text-red-800"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* SECTION 3: Savings Goals */}
        <section className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className={`text-2xl font-bold ${textColor}`}>Metas de Ahorro</h2>
            <button
              onClick={() => {
                setEditingGoal(null);
                setGoalForm({
                  name: '',
                  currentSavings: 0,
                  targetAmount: 0,
                  monthsToSave: 12,
                  interestRate: 0
                });
                setShowGoalModal(true);
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-none font-medium transition-colors ${buttonStyle}`}
            >
              <Plus size={16} /> Añadir Meta
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {goals.map(goal => {
              const requiredMonthly = calculateRequiredMonthlySavings(goal.targetAmount, goal.currentSavings, goal.monthsToSave, goal.interestRate);
              const progressPercent = (goal.currentSavings / goal.targetAmount) * 100;
              return (
                <div key={goal.id} className={`${bgColor} rounded-lg border ${borderColor} p-6 shadow-sm`}>
                  <div className="flex justify-between items-start mb-4">
                    <h3 className={`text-lg font-semibold ${textColor}`}>{goal.name}</h3>
                    <div className="flex gap-1">
                      <button
                        onClick={() => {
                          setEditingGoal(goal);
                          setGoalForm(goal);
                          setShowGoalModal(true);
                        }}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => deleteGoal(goal.id)}
                        className="text-red-600 hover:text-red-800"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <p className={`text-sm ${labelColor}`}>Ahorro Actual</p>
                      <p className={`text-lg font-semibold ${textColor}`}>R$ {goal.currentSavings.toFixed(2)}</p>
                    </div>
                    
                    <div>
                      <p className={`text-sm ${labelColor}`}>Meta Total</p>
                      <p className={`text-lg font-semibold ${textColor}`}>R$ {goal.targetAmount.toFixed(2)}</p>
                    </div>
                    
                    <div>
                      <p className={`text-sm ${labelColor}`}>Meses para Ahorrar</p>
                      <p className={`text-lg font-semibold ${textColor}`}>{goal.monthsToSave}</p>
                    </div>
                    
                    <div>
                      <p className={`text-sm ${labelColor}`}>Tasa de Interés Anual</p>
                      <p className={`text-lg font-semibold ${textColor}`}>{goal.interestRate.toFixed(1)}%</p>
                    </div>

                    <div className="bg-blue-50 dark:bg-blue-900 rounded-lg p-3 mt-4">
                      <p className={`text-sm ${labelColor} mb-1`}>Ahorro mensual necesario</p>
                      <p className="text-2xl font-bold text-blue-600">R$ {requiredMonthly.toFixed(2)}</p>
                    </div>

                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className={labelColor}>Progreso</span>
                        <span className={labelColor}>{progressPercent.toFixed(0)}%</span>
                      </div>
                      <div className={`w-full bg-gray-200 rounded-full h-2 ${darkMode ? 'bg-gray-700' : ''}`}>
                        <div
                          className="bg-blue-600 h-2 rounded-full transition-all"
                          style={{ width: `${Math.min(progressPercent, 100)}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* Income Modal */}
      {showIncomeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className={`${bgColor} rounded-lg p-6 w-96 max-h-96 overflow-y-auto`}>
            <h3 className={`text-lg font-bold ${textColor} mb-4`}>{editingIncome ? 'Editar Ingreso' : 'Añadir Ingreso'}</h3>
            
            <div className="space-y-3">
              <div>
                <label className={`text-sm ${labelColor}`}>Concepto</label>
                <input
                  type="text"
                  value={incomeForm.concept}
                  onChange={(e) => setIncomeForm({ ...incomeForm, concept: e.target.value })}
                  className={`w-full px-3 py-2 rounded border ${borderColor} ${bgColor} ${textColor}`}
                  placeholder="Salario, Bono, etc."
                />
              </div>

              <div>
                <label className={`text-sm ${labelColor}`}>Tipo</label>
                <select
                  value={incomeForm.type}
                  onChange={(e) => setIncomeForm({ ...incomeForm, type: e.target.value as 'Fijo' | 'Variable' })}
                  className={`w-full px-3 py-2 rounded border ${borderColor} ${bgColor} ${textColor}`}
                >
                  <option value="Fijo">Fijo</option>
                  <option value="Variable">Variable</option>
                </select>
              </div>

              <div>
                <label className={`text-sm ${labelColor}`}>Monto</label>
                <input
                  type="number"
                  value={incomeForm.amount}
                  onChange={(e) => setIncomeForm({ ...incomeForm, amount: Number(e.target.value) })}
                  className={`w-full px-3 py-2 rounded border ${borderColor} ${bgColor} ${textColor}`}
                  placeholder="0.00"
                />
              </div>

              <div className="flex gap-2 mt-6">
                <button
                  onClick={() => {
                    if (editingIncome) {
                      updateIncome(editingIncome.id);
                    } else {
                      addIncome();
                    }
                  }}
                  className={`flex-1 px-4 py-2 rounded-none font-medium transition-colors ${buttonStyle}`}
                >
                  Guardar
                </button>
                <button
                  onClick={() => setShowIncomeModal(false)}
                  className={`flex-1 border-2 border-black px-4 py-2 rounded-none font-medium ${darkMode ? 'bg-gray-900 text-white hover:bg-white hover:text-black' : 'bg-white text-black hover:bg-black hover:text-white'}`}
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Expense Modal */}
      {showExpenseModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
          <div className={`${bgColor} rounded-lg p-6 w-96 my-8`}>
            <h3 className={`text-lg font-bold ${textColor} mb-4`}>{editingExpense ? 'Editar Gasto' : 'Añadir Gasto'}</h3>
            
            <div className="space-y-3">
              <div>
                <label className={`text-sm ${labelColor}`}>Categoría</label>
                <input
                  type="text"
                  value={expenseForm.category}
                  onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}
                  className={`w-full px-3 py-2 rounded border ${borderColor} ${bgColor} ${textColor}`}
                  placeholder="Casa, Comida, etc."
                />
              </div>

              <div>
                <label className={`text-sm ${labelColor}`}>Descripción</label>
                <input
                  type="text"
                  value={expenseForm.description}
                  onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                  className={`w-full px-3 py-2 rounded border ${borderColor} ${bgColor} ${textColor}`}
                  placeholder="Descripción del gasto"
                />
              </div>

              <div>
                <label className={`text-sm ${labelColor}`}>Monto</label>
                <input
                  type="number"
                  value={expenseForm.amount}
                  onChange={(e) => setExpenseForm({ ...expenseForm, amount: Number(e.target.value) })}
                  className={`w-full px-3 py-2 rounded border ${borderColor} ${bgColor} ${textColor}`}
                  placeholder="0.00"
                />
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={expenseForm.isFixed}
                    onChange={(e) => setExpenseForm({ ...expenseForm, isFixed: e.target.checked })}
                  />
                  <span className={`text-sm ${textColor}`}>¿Es un gasto fijo?</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={expenseForm.isCardPayment}
                    onChange={(e) => setExpenseForm({ ...expenseForm, isCardPayment: e.target.checked })}
                  />
                  <span className={`text-sm ${textColor}`}>¿Se paga con tarjeta?</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={expenseForm.isAntExpense}
                    onChange={(e) => setExpenseForm({ ...expenseForm, isAntExpense: e.target.checked })}
                  />
                  <span className={`text-sm ${textColor}`}>¿Es un gasto hormiga? 🐜</span>
                </label>
              </div>

              <div className="flex gap-2 mt-6">
                <button
                  onClick={() => {
                    if (editingExpense) {
                      updateExpense(editingExpense.id);
                    } else {
                      addExpense();
                    }
                  }}
                  className={`flex-1 px-4 py-2 rounded-none font-medium transition-colors ${buttonStyle}`}
                >
                  Guardar
                </button>
                <button
                  onClick={() => setShowExpenseModal(false)}
                  className={`flex-1 border-2 border-black px-4 py-2 rounded-none font-medium ${darkMode ? 'bg-gray-900 text-white hover:bg-white hover:text-black' : 'bg-white text-black hover:bg-black hover:text-white'}`}
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Goal Modal */}
      {showGoalModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
          <div className={`${bgColor} rounded-lg p-6 w-96 my-8`}>
            <h3 className={`text-lg font-bold ${textColor} mb-4`}>{editingGoal ? 'Editar Meta' : 'Añadir Meta'}</h3>
            
            <div className="space-y-3">
              <div>
                <label className={`text-sm ${labelColor}`}>Nombre de la Meta</label>
                <input
                  type="text"
                  value={goalForm.name}
                  onChange={(e) => setGoalForm({ ...goalForm, name: e.target.value })}
                  className={`w-full px-3 py-2 rounded border ${borderColor} ${bgColor} ${textColor}`}
                  placeholder="Compra importante, Vacaciones, etc."
                />
              </div>

              <div>
                <label className={`text-sm ${labelColor}`}>Ahorro Actual</label>
                <input
                  type="number"
                  value={goalForm.currentSavings}
                  onChange={(e) => setGoalForm({ ...goalForm, currentSavings: Number(e.target.value) })}
                  className={`w-full px-3 py-2 rounded border ${borderColor} ${bgColor} ${textColor}`}
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className={`text-sm ${labelColor}`}>Meta Total</label>
                <input
                  type="number"
                  value={goalForm.targetAmount}
                  onChange={(e) => setGoalForm({ ...goalForm, targetAmount: Number(e.target.value) })}
                  className={`w-full px-3 py-2 rounded border ${borderColor} ${bgColor} ${textColor}`}
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className={`text-sm ${labelColor}`}>Meses para Ahorrar</label>
                <input
                  type="number"
                  value={goalForm.monthsToSave}
                  onChange={(e) => setGoalForm({ ...goalForm, monthsToSave: Number(e.target.value) })}
                  className={`w-full px-3 py-2 rounded border ${borderColor} ${bgColor} ${textColor}`}
                  placeholder="12"
                />
              </div>

              <div>
                <label className={`text-sm ${labelColor}`}>Tasa de Interés Anual (%)</label>
                <input
                  type="number"
                  value={goalForm.interestRate}
                  onChange={(e) => setGoalForm({ ...goalForm, interestRate: Number(e.target.value) })}
                  className={`w-full px-3 py-2 rounded border ${borderColor} ${bgColor} ${textColor}`}
                  placeholder="0"
                />
              </div>

              <div className="flex gap-2 mt-6">
                <button
                  onClick={() => {
                    if (editingGoal) {
                      updateGoal(editingGoal.id);
                    } else {
                      addGoal();
                    }
                  }}
                  className={`flex-1 px-4 py-2 rounded-none font-medium transition-colors ${buttonStyle}`}
                >
                  Guardar
                </button>
                <button
                  onClick={() => setShowGoalModal(false)}
                  className={`flex-1 border-2 border-black px-4 py-2 rounded-none font-medium ${darkMode ? 'bg-gray-900 text-white hover:bg-white hover:text-black' : 'bg-white text-black hover:bg-black hover:text-white'}`}
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FinancialPlannerPage;
