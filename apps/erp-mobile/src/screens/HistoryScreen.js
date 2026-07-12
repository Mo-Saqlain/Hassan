import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, Pressable } from 'react-native';
import { getSales, getPurchases } from '../api';
import { useLoad, errMessage } from '../useLoad';
import { Loading, ErrorView, Empty, SearchBar, Segmented, Badge } from '../components/ui';
import { money, dateTime, qty } from '../format';
import { colors } from '../theme';

export default function HistoryScreen() {
  const [mode, setMode] = useState('sales');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);

  const isSales = mode === 'sales';
  const { data, loading, refreshing, error, reload, refresh } = useLoad(
    () => (isSales ? getSales({ search }) : getPurchases({ search })),
    [mode, search],
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Segmented
        value={mode}
        onChange={(m) => {
          setMode(m);
          setExpanded(null);
        }}
        options={[
          { label: 'Sales', value: 'sales' },
          { label: 'Purchases', value: 'purchases' },
        ]}
      />
      <SearchBar
        value={search}
        onChangeText={setSearch}
        placeholder={isSales ? 'Search invoice no…' : 'Search bill no…'}
      />
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorView message={errMessage(error)} onRetry={reload} />
      ) : (data || []).length === 0 ? (
        <Empty message="No records found." />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(it) => it.id}
          contentContainerStyle={{ paddingBottom: 24, paddingTop: 4 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
          renderItem={({ item }) => (
            <TxnCard
              item={item}
              isSales={isSales}
              open={expanded === item.id}
              onToggle={() => setExpanded(expanded === item.id ? null : item.id)}
            />
          )}
        />
      )}
    </View>
  );
}

function TxnCard({ item, isSales, open, onToggle }) {
  const ref = isSales ? item.invoice_no : item.bill_no;
  const party = isSales ? item.customers?.name : item.suppliers?.name;
  const lines = isSales ? item.sale_items : item.purchase_items;
  const due = Number(item.due_amount || 0);
  const reversed = !!item.reversed_at;

  return (
    <Pressable style={styles.card} onPress={onToggle}>
      <View style={styles.headRow}>
        <Text style={styles.ref}>{ref}</Text>
        <Text style={styles.amount}>{money(item.net_amount)}</Text>
      </View>
      <View style={styles.headRow}>
        <Text style={styles.party}>{party || (isSales ? 'Walk-in' : 'No supplier')}</Text>
        <Text style={styles.date}>{dateTime(item.created_at)}</Text>
      </View>
      <View style={styles.badges}>
        <Badge text={item.payment_method || 'CASH'} />
        {due > 0.005 ? <Badge text={`Due ${money(due)}`} tone="warn" /> : <Badge text="Paid" tone="pos" />}
        {reversed ? <Badge text="REVERSED" tone="neg" /> : null}
      </View>

      {open ? (
        <View style={styles.lines}>
          {(lines || []).map((ln, i) => (
            <View key={i} style={styles.lineRow}>
              <Text style={styles.lineName} numberOfLines={1}>
                {ln.items?.name || ln.items?.sku || 'Item'}
              </Text>
              <Text style={styles.lineQty}>{qty(ln.quantity)} × {money(ln.unit_price)}</Text>
              <Text style={styles.lineTotal}>{money(ln.line_total)}</Text>
            </View>
          ))}
          {Number(item.discount) > 0 ? (
            <Text style={styles.discount}>Discount: {money(item.discount)}</Text>
          ) : null}
        </View>
      ) : (
        <Text style={styles.tapHint}>{(lines || []).length} item(s) · tap for detail</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginHorizontal: 12,
    marginTop: 10,
  },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ref: { fontWeight: '700', fontSize: 15, color: colors.primary },
  amount: { fontWeight: '700', fontSize: 15, color: colors.text },
  party: { color: colors.text, fontSize: 13, flex: 1 },
  date: { color: colors.textFaint, fontSize: 12 },
  badges: { flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' },
  lines: { marginTop: 10, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 },
  lineRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 3 },
  lineName: { flex: 1, color: colors.text, fontSize: 13 },
  lineQty: { color: colors.textMuted, fontSize: 12, marginHorizontal: 8 },
  lineTotal: { color: colors.text, fontSize: 13, fontWeight: '600', minWidth: 70, textAlign: 'right' },
  discount: { color: colors.textMuted, fontSize: 12, marginTop: 6 },
  tapHint: { color: colors.textFaint, fontSize: 12, marginTop: 8 },
});
