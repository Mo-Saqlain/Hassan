import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, Pressable } from 'react-native';
import { getSaleReturns, getPurchaseReturns } from '../api';
import { useLoad, errMessage } from '../useLoad';
import { Loading, ErrorView, Empty, SearchBar, Segmented, Badge } from '../components/ui';
import { money, dateTime, qty } from '../format';
import { colors } from '../theme';

// Read-only view of sale/purchase returns. Surfaces the disposition so the
// owner can see, from the phone, whether a returned unit came back to the shelf
// or went to the company (warranty claim / exchange give-back).
export default function ReturnsScreen() {
  const [mode, setMode] = useState('sales');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);

  const isSales = mode === 'sales';
  const { data, loading, refreshing, error, reload, refresh } = useLoad(
    () => (isSales ? getSaleReturns({ search }) : getPurchaseReturns({ search })),
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
          { label: 'Sale returns', value: 'sales' },
          { label: 'Purchase returns', value: 'purchases' },
        ]}
      />
      <SearchBar value={search} onChangeText={setSearch} placeholder="Search return no…" />
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorView message={errMessage(error)} onRetry={reload} />
      ) : (data || []).length === 0 ? (
        <Empty message="No returns found." />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(it) => it.id}
          contentContainerStyle={{ paddingBottom: 24, paddingTop: 4 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
          renderItem={({ item }) => (
            <ReturnCard
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

function dispositionBadge(disposition, isSales) {
  if (isSales) {
    return disposition === 'CLAIMED_TO_COMPANY'
      ? { text: 'To company', tone: 'warn' }
      : { text: 'Restocked', tone: 'pos' };
  }
  return disposition === 'WARRANTY_CREDIT'
    ? { text: 'Warranty credit', tone: 'warn' }
    : { text: 'To supplier', tone: 'pos' };
}

function ReturnCard({ item, isSales, open, onToggle }) {
  const party = isSales ? item.customers?.name : item.suppliers?.name;
  const lines = isSales ? item.sale_return_items : item.purchase_return_items;
  const refund = Number(item.refund_amount || 0);
  const disp = dispositionBadge(item.disposition, isSales);
  const isExchange = isSales && !!item.replacement_sale_id;

  return (
    <Pressable style={styles.card} onPress={onToggle}>
      <View style={styles.headRow}>
        <Text style={styles.ref}>{item.return_no}</Text>
        <Text style={styles.amount}>{money(item.total_amount)}</Text>
      </View>
      <View style={styles.headRow}>
        <Text style={styles.party}>{party || (isSales ? 'Walk-in' : 'No supplier')}</Text>
        <Text style={styles.date}>{dateTime(item.created_at)}</Text>
      </View>
      <View style={styles.badges}>
        <Badge text={disp.text} tone={disp.tone} />
        {isExchange ? <Badge text="Exchange" tone="pos" /> : null}
        {isSales && refund > 0.005 ? <Badge text={`Cash back ${money(refund)}`} tone="neg" /> : null}
        {isSales && refund <= 0.005 ? <Badge text="Store credit" /> : null}
      </View>

      {open ? (
        <View style={styles.lines}>
          {(lines || []).map((ln, i) => (
            <View key={i} style={styles.lineRow}>
              <Text style={styles.lineName} numberOfLines={1}>
                {ln.items?.name || 'Item'}
              </Text>
              <Text style={styles.lineQty}>{qty(ln.quantity)} × {money(ln.unit_price)}</Text>
              <Text style={styles.lineTotal}>{money(ln.line_total)}</Text>
            </View>
          ))}
          {item.reason ? <Text style={styles.reason}>Reason: {item.reason}</Text> : null}
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
  reason: { color: colors.textMuted, fontSize: 12, marginTop: 6 },
  tapHint: { color: colors.textFaint, fontSize: 12, marginTop: 8 },
});
