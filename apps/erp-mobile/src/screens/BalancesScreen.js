import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { getCustomerBalances, getSupplierBalances } from '../api';
import { useLoad, errMessage } from '../useLoad';
import { Loading, ErrorView, Empty, SearchBar, Segmented } from '../components/ui';
import { money } from '../format';
import { colors } from '../theme';

export default function BalancesScreen() {
  const [mode, setMode] = useState('customers');
  const [search, setSearch] = useState('');
  const isCust = mode === 'customers';

  const { data, loading, refreshing, error, reload, refresh } = useLoad(
    () => (isCust ? getCustomerBalances({ search }) : getSupplierBalances({ search })),
    [mode, search],
  );

  const total = (data || []).reduce((s, r) => s + Math.max(0, Number(r.balance || 0)), 0);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { label: 'Customers (A/R)', value: 'customers' },
          { label: 'Suppliers (A/P)', value: 'suppliers' },
        ]}
      />
      <SearchBar value={search} onChangeText={setSearch} placeholder="Search name, phone, code…" />

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorView message={errMessage(error)} onRetry={reload} />
      ) : (data || []).length === 0 ? (
        <Empty message="No parties found." />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(it) => (isCust ? it.customer_id : it.supplier_id)}
          contentContainerStyle={{ paddingBottom: 24, paddingTop: 2 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
          ListHeaderComponent={
            <View style={styles.totalBar}>
              <Text style={styles.totalLabel}>
                {isCust ? 'Total receivable (outstanding)' : 'Total payable (outstanding)'}
              </Text>
              <Text style={styles.totalValue}>{money(total)}</Text>
            </View>
          }
          renderItem={({ item }) => <PartyRow item={item} />}
        />
      )}
    </View>
  );
}

function PartyRow({ item }) {
  const bal = Number(item.balance || 0);
  const tone = bal > 0.005 ? colors.negative : bal < -0.005 ? colors.positive : colors.textMuted;
  return (
    <View style={styles.card}>
      <View style={{ flex: 1 }}>
        <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.meta}>
          {[item.code, item.phone].filter(Boolean).join(' · ') || '—'}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[styles.bal, { color: tone }]}>{money(Math.abs(bal))}</Text>
        <Text style={styles.balHint}>{bal > 0.005 ? 'owes' : bal < -0.005 ? 'credit' : 'settled'}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  totalBar: {
    backgroundColor: colors.surfaceElev,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  totalLabel: { color: colors.textMuted, fontSize: 13 },
  totalValue: { color: colors.text, fontWeight: '700', fontSize: 16 },
  card: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  name: { fontWeight: '600', fontSize: 15, color: colors.text },
  meta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  bal: { fontWeight: '700', fontSize: 16 },
  balHint: { color: colors.textFaint, fontSize: 11, marginTop: 1 },
});
