import { useState, useEffect, useRef } from 'react';
import './CheckoutModal.css';
import {
  useClipPayment,
  detectCardBrand,
  isInternationalCard,
  luhnCheck,
  isCardExpired,
  formatCardNumber,
  isValidEmail,
  isValidPhone,
  type CardData,
  type CustomerData,
  type InstallmentOption,
  type CardBrand,
} from '../hooks/useClipPayment';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  amount: number;
  description: string;
  onSuccess: (transactionId: string) => void;
}

type Step = 'customer' | 'card' | 'installments' | 'processing' | 'success' | 'error';

const EMPTY_CARD: CardData = { card_number: '', card_holder_name: '', expiration_month: '', expiration_year: '', cvv: '' };
const EMPTY_CUSTOMER: CustomerData = { name: '', email: '', phone: '' };

export function CheckoutModal({ isOpen, onClose, amount, description, onSuccess }: CheckoutModalProps) {
  const { pagar, fetchInstallments, status, error, installments, loadingInstallments, reset } = useClipPayment();

  const [step, setStep] = useState<Step>('customer');
  const [customer, setCustomer] = useState<CustomerData>(EMPTY_CUSTOMER);
  const [card, setCard] = useState<CardData>(EMPTY_CARD);
  const [cardDisplayNumber, setCardDisplayNumber] = useState('');
  const [cardBrand, setCardBrand] = useState<CardBrand>('unknown');
  const [isInternational, setIsInternational] = useState(false);
  const [address, setAddress] = useState({ zip_code: '', city: '', country: 'MX' });
  const [selectedInstallment, setSelectedInstallment] = useState<InstallmentOption | null>(null);

  const firstInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && step === 'customer') {
      setTimeout(() => firstInputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  useEffect(() => {
    const digits = card.card_number.replace(/\s/g, '');
    if (digits.length >= 6) {
      const brand = detectCardBrand(digits);
      const international = isInternationalCard(digits);
      setCardBrand(brand);
      setIsInternational(international);
      if (digits.length >= 6 && amount > 0) fetchInstallments(amount, brand);
    } else {
      setCardBrand('unknown');
      setIsInternational(false);
    }
  }, [card.card_number, amount]);

  const handleSubmitPayment = async (instOption: InstallmentOption | null) => {
    setStep('processing');
    const customerData = isInternational ? { ...customer, address } : customer;
    const result = await pagar(card, amount, customerData, description, instOption);

    if (result.success && result.transaction_id) {
      setStep('success');
      setTimeout(() => onSuccess(result.transaction_id!), 2000);
    } else if (result.requires_action && result.redirect_url) {
      window.location.href = result.redirect_url;
    } else {
      setStep('error');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="checkout-modal__overlay">
      <div className="checkout-modal__container">
        {/* Header con monto */}
        <div className="checkout-modal__header">
          <div>
            <span className="checkout-modal__brand">Divina Store</span>
            <span className="checkout-modal__amount">${amount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
            <span className="checkout-modal__description">{description}</span>
          </div>
          <button className="checkout-modal__close" onClick={onClose}>✕</button>
        </div>

        {/* Paso 1: Cliente */}
        {step === 'customer' && (
          <div className="checkout-modal__step">
            <h2 className="checkout-modal__step-title">Información de contacto</h2>
            <div className="checkout-modal__field">
              <label className="checkout-modal__label">Nombre Completo</label>
              <input ref={firstInputRef} className="checkout-modal__input" type="text" placeholder="Ej. Maria Garcia" value={customer.name} onChange={e => setCustomer({...customer, name: e.target.value})} />
            </div>
            <div className="checkout-modal__field">
              <label className="checkout-modal__label">Correo Electrónico</label>
              <input className="checkout-modal__input" type="email" placeholder="maria@ejemplo.com" value={customer.email} onChange={e => setCustomer({...customer, email: e.target.value})} />
            </div>
            <button className="checkout-modal__btn-primary" onClick={() => setStep('card')} disabled={!isValidEmail(customer.email)}>Continuar al pago</button>
          </div>
        )}

        {/* Paso 2: Tarjeta */}
        {step === 'card' && (
          <div className="checkout-modal__step">
            <h2 className="checkout-modal__step-title">Datos de pago</h2>
            <div className="checkout-modal__field">
              <label className="checkout-modal__label">Número de Tarjeta</label>
              <div className="checkout-modal__card-number-wrapper">
                <input className="checkout-modal__input" type="text" placeholder="0000 0000 0000 0000" value={cardDisplayNumber} onChange={e => {
                  const val = e.target.value.replace(/\D/g, '');
                  setCard({...card, card_number: val});
                  setCardDisplayNumber(formatCardNumber(val, detectCardBrand(val)));
                }} maxLength={19} />
                <span className="checkout-modal__card-brand">{cardBrand.toUpperCase()}</span>
              </div>
              {isInternational && <span className="checkout-modal__international-badge">🌎 Tarjeta Internacional</span>}
            </div>
            <div className="checkout-modal__field-row">
              <div className="checkout-modal__field--half">
                <label className="checkout-modal__label">Vencimiento</label>
                <input className="checkout-modal__input" type="text" placeholder="MM/AA" maxLength={5} onChange={e => {
                  const val = e.target.value.replace(/\D/g, '');
                  if (val.length <= 4) setCard({...card, expiration_month: val.slice(0,2), expiration_year: val.slice(2,4)});
                  e.target.value = val.length >= 2 ? val.slice(0,2) + '/' + val.slice(2,4) : val;
                }} />
              </div>
              <div className="checkout-modal__field--half">
                <label className="checkout-modal__label">CVV</label>
                <input className="checkout-modal__input" type="password" placeholder="***" maxLength={4} value={card.cvv} onChange={e => setCard({...card, cvv: e.target.value.replace(/\D/g, '')})} />
              </div>
            </div>
            <button className="checkout-modal__btn-primary" onClick={() => installments.length > 0 ? setStep('installments') : handleSubmitPayment(null)} disabled={loadingInstallments}>
              {loadingInstallments ? 'Validando...' : `Pagar Ahora`}
            </button>
            <button className="checkout-modal__btn-back" onClick={() => setStep('customer')}>Regresar</button>
          </div>
        )}

        {/* Paso 3: MSI */}
        {step === 'installments' && (
          <div className="checkout-modal__step">
            <h2 className="checkout-modal__step-title">Opciones de Pago</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
              <div onClick={() => setSelectedInstallment(null)} style={{ padding: 12, borderRadius: 12, border: `1px solid ${selectedInstallment === null ? 'var(--clip-lime)' : 'rgba(255,255,255,0.1)'}`, cursor: 'pointer' }}>
                <span style={{ color: '#fff', fontSize: 14 }}>Pago de contado</span>
              </div>
              {installments.map(opt => (
                <div key={opt.months} onClick={() => setSelectedInstallment(opt)} style={{ padding: 12, borderRadius: 12, border: `1px solid ${selectedInstallment?.months === opt.months ? 'var(--clip-lime)' : 'rgba(255,255,255,0.1)'}`, cursor: 'pointer' }}>
                  <span style={{ color: '#fff', fontSize: 14 }}>{opt.months} meses {opt.type === 'msi' ? 'sin intereses' : ''}</span>
                  <div style={{ fontSize: 12, color: '#888' }}>${opt.monthly_amount.toFixed(2)} / mes</div>
                </div>
              ))}
            </div>
            <button className="checkout-modal__btn-primary" onClick={() => handleSubmitPayment(selectedInstallment)}>Confirmar Pago</button>
          </div>
        )}

        {/* Procesando */}
        {step === 'processing' && (
          <div className="checkout-modal__step" style={{ textAlign: 'center' }}>
            <div className="checkout-modal__spinner"></div>
            <p style={{ color: '#fff' }}>Procesando tu compra de forma segura...</p>
          </div>
        )}

        {/* Éxito */}
        {step === 'success' && (
          <div className="checkout-modal__step" style={{ textAlign: 'center' }}>
            <div className="checkout-modal__success-icon">✓</div>
            <h2 style={{ color: '#fff' }}>¡Gracias por tu compra!</h2>
            <p style={{ color: '#888' }}>Recibirás un correo con los detalles.</p>
          </div>
        )}

        {/* Error */}
        {step === 'error' && (
          <div className="checkout-modal__step" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 20 }}>❌</div>
            <h2 style={{ color: '#fff' }}>Pago No Procesado</h2>
            <p style={{ color: '#ff4444' }}>{error || 'Hubo un problema con tu tarjeta.'}</p>
            <button className="checkout-modal__btn-primary" onClick={() => setStep('card')}>Intentar de nuevo</button>
          </div>
        )}
      </div>
    </div>
  );
}
