import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';

export default function PaymentPrint() {
  const { id } = useParams();
  const [payment, setPayment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const r = await api.get(`/payments/${id}`);
        setPayment(r.data);
      } catch (e) {
        setError(e.uiMessage ?? 'Failed to load payment voucher.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  if (loading) return <div style={{ padding: 20 }}>Loading payment receipt…</div>;
  if (error) return <div style={{ padding: 20, color: 'red' }}>{error}</div>;
  if (!payment) return null;

  const isReceipt = payment.direction === 'IN';
  const partyName =
    payment.customer?.name ||
    payment.supplier?.name ||
    payment.expenseAccount?.name ||
    'Cash Party';
  const partyPhone = payment.customer?.phone || payment.supplier?.phone || '';
  const partyAddress = payment.customer?.address || payment.supplier?.address || '';

  const voucherTitle = isReceipt
    ? 'RECEIPT VOUCHER'
    : payment.expenseAccountId
    ? 'EXPENSE VOUCHER'
    : 'PAYMENT VOUCHER';

  return (
    <div className="print-page" style={{ maxWidth: 800, margin: '0 auto', padding: 24, fontFamily: 'sans-serif' }}>
      <div className="no-print" style={{ marginBottom: 16, display: 'flex', gap: 12 }}>
        <button className="btn btn-primary" onClick={() => window.print()}>
          🖨 Print Voucher Receipt
        </button>
        <button className="btn" onClick={() => window.close()}>
          Close
        </button>
      </div>

      <div
        style={{
          border: '2px solid #000',
          padding: 24,
          borderRadius: 8,
          background: '#fff',
        }}
      >
        {/* Header */}
        <div style={{ textTransform: 'uppercase', textAlign: 'center', borderBottom: '2px solid #000', pb: 12, marginBottom: 16 }}>
          <h1 style={{ margin: 0, fontSize: 24, letterSpacing: 1 }}>HASSAN ELECTRONICS</h1>
          <p style={{ margin: '4px 0', fontSize: 13 }}>Multi-Showroom Retail & Wholesale Appliances</p>
          <p style={{ margin: '2px 0', fontSize: 12 }}>Phone: 0300-1234567 | Address: Main Showroom Market</p>
        </div>

        {/* Voucher Title & Date Banner */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: '1px solid #ccc', paddingBottom: 8 }}>
          <div>
            <span style={{ fontSize: 18, fontWeight: 'bold', background: '#000', color: '#fff', padding: '4px 12px', borderRadius: 4 }}>
              {voucherTitle}
            </span>
          </div>
          <div style={{ textAlign: 'right', fontSize: 13 }}>
            <div><strong>Voucher No:</strong> {payment.voucherNo}</div>
            <div><strong>Date:</strong> {new Date(payment.createdAt).toLocaleDateString('en-GB')} {new Date(payment.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
          </div>
        </div>

        {/* Party & Account Details */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20, fontSize: 14 }}>
          <div>
            <div style={{ textTransform: 'uppercase', fontSize: 11, color: '#666', fontWeight: 'bold' }}>
              {isReceipt ? 'Received From (Customer)' : payment.expenseAccountId ? 'Expense Category' : 'Paid To (Party)'}:
            </div>
            <div style={{ fontSize: 16, fontWeight: 'bold', marginTop: 2 }}>{partyName}</div>
            {partyPhone && <div>Phone: {partyPhone}</div>}
            {partyAddress && <div>Address: {partyAddress}</div>}
          </div>
          <div>
            <div style={{ textTransform: 'uppercase', fontSize: 11, color: '#666', fontWeight: 'bold' }}>
              Payment Channel / Account:
            </div>
            <div style={{ fontSize: 15, fontWeight: 'bold', marginTop: 2 }}>
              {payment.account?.name ?? 'Cash on Hand'}
            </div>
            {payment.referenceType && (
              <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}>
                Ref: {payment.referenceType} {payment.referenceId ? `#${payment.referenceId.slice(0, 8)}` : ''}
              </div>
            )}
          </div>
        </div>

        {/* Amount Box */}
        <div
          style={{
            background: '#f8fafc',
            border: '1px solid #cbd5e1',
            padding: 16,
            borderRadius: 6,
            marginBottom: 20,
            display: 'flex',
            justify: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <div style={{ fontSize: 12, color: '#475569', fontWeight: 'bold' }}>AMOUNT PAID / RECEIVED</div>
            <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>
              {payment.notes || 'Payment recorded on account'}
            </div>
          </div>
          <div style={{ fontSize: 24, fontWeight: 'bold', color: '#0f172a' }}>
            Rs. {Number(payment.amount).toLocaleString('en-PK', { minimumFractionDigits: 2 })}
          </div>
        </div>

        {/* Signature Footer */}
        <div style={{ marginTop: 48, display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ borderTop: '1px solid #000', width: 180, paddingTop: 4 }}>Customer / Receiver Signature</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ borderTop: '1px solid #000', width: 180, paddingTop: 4 }}>Authorized Cashier / Stamp</div>
          </div>
        </div>
      </div>
    </div>
  );
}
