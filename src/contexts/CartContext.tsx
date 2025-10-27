import React, { createContext, useContext, useState, ReactNode } from 'react';
import { parsePrice } from '../utils/format';

export interface CartItem {
  id: string;
  type: 'portrait' | 'maternity' | 'events' | 'store';
  name: string;
  price: string;
  duration: string;
  image: string;
  quantity: number;
}

interface CartContextType {
  items: CartItem[];
  addToCart: (item: Omit<CartItem, 'quantity'>) => void;
  removeFromCart: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  getTotalPrice: () => number;
  getItemCount: () => number;
  isCartOpen: boolean;
  setIsCartOpen: (open: boolean) => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};

interface CartProviderProps {
  children: ReactNode;
}

export const CartProvider: React.FC<CartProviderProps> = ({ children }) => {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);

  const addToCart = (newItem: Omit<CartItem, 'quantity'>) => {
    
    setItems(prevItems => {
      const existingItem = prevItems.find(item => item.id === newItem.id);
      let newItems;
      
      if (existingItem) {
        newItems = prevItems.map(item =>
          item.id === newItem.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      } else {
        newItems = [...prevItems, { ...newItem, quantity: 1 }];
      }
      
      return newItems;
    });
    
    setIsCartOpen(true);
  };

  const removeFromCart = (id: string) => {
    setItems(prevItems => prevItems.filter(item => item.id !== id));
  };

  const updateQuantity = (id: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(id);
      return;
    }
    setItems(prevItems =>
      prevItems.map(item =>
        item.id === id ? { ...item, quantity } : item
      )
    );
  };

  const clearCart = () => {
    setItems([]);
  };

  const getTotalPrice = () => {
    return items.reduce((total, item) => {
      // item.price can be a formatted string (R$ 1.000) or a number
      // use parsePrice utility for robust parsing
      try {
        // lazy import to avoid circular deps
        const price = parsePrice(item.price);
        return total + (price * item.quantity);
      } catch (e) {
        // fallback
        const raw = typeof item.price === 'number' ? item.price : Number(String(item.price).replace(/[^0-9.-]/g, ''));
        const price = isNaN(raw) ? 0 : raw;
        return total + (price * item.quantity);
      }
    }, 0);
  };

  const getItemCount = () => {
    return items.reduce((total, item) => total + item.quantity, 0);
  };

  return (
    <CartContext.Provider value={{
      items,
      addToCart,
      removeFromCart,
      updateQuantity,
      clearCart,
      getTotalPrice,
      getItemCount,
      isCartOpen,
      setIsCartOpen
    }}>
      {children}
    </CartContext.Provider>
  );
};
