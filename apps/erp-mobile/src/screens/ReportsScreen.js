import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { getProductSales } from '../api';
import { useLoad, errMessage } from '../useLoad';
import { Loading, ErrorView, Empty, SearchBar, Segmented } from '../components/ui';
import { money, qty } from '../format';
import { colors } from '../theme';

// Top products by revenue or profit — read from the mobile_product_sales view.
export default function ReportsScreen() {
  const [sort, setSort] = useState('revenue');
  const [search, setSearch] = useState('');

  const { data, loading, refreshing, error, reload, refresh } = useLoad(
    () => getProductSales({ search, sort }),
    [sort, search],
  );

  const totals = (data || []).reduce(
    (acc, r) => ({
      revenue: acc.revenue + Number(r.revenue || 0),
      profit: acc.profit + Number(r.profit || 0),
    }),
    { revenue: 0, profit: 0 },
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Segmented
        value={sort}
        onChange={setSort}
        options={[
          { label: 'By revenue', value: 'revenue' },
          { label: 'By profit', value: 'profit' },
        ]}
      />
      <SearchBar value={search} onChangeText={setSearch} placeholder="Search product, brand…" />
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorView message={errMessage(error)} onRetry={reload} />
      ) : (data || []).length === 0 ? (
        <Empty message="No sales yet." />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(it) => it.item_id}
          contentContainerStyle={{ paddingBottom: 24, paddingTop: 2 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
          ListHeaderComponent={
            <View style={styles.totalBar}>
              <View>
                <Text style={styles.totalLabel}>Revenue (top {(data || []).length})</Text>
                <Text style={styles.totalValue}>{money(totals.revenue)}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.totalLabel}>Profit</Text>
                <Text style={[styles.totalValue, { color: colors.positive }]}>
                  {money(totals.profit)}
                </Text>
              </View>
            </View>
          }
          renderItem={({ item, index }) => (
            <ProductRow item={item} rank={index + 1} sort={sort} />
          )}
        />
      )}
    </View>
  );
}

function ProductRow({ item, rank, sort }) {
  const profit = Number(item.profit || 0);
  const margin = Number(item.revenue) > 0 ? (profit / Number(item.revenue)) * 100 : 0;
  return (
    <View style={styles.card}>
      <Text style={styles.rank}>{rank}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.meta}>
          {[item.brand, `${qty(item.units_sold)} sold`].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.primary}>
          {money(sort === 'profit' ? item.profit : item.revenue)}
        </Text>
        <Text style={styles.secondary}>
          {sort === 'profit'
            ? `${money(item.revenue)} rev`
            : `${money(item.profit)} · ${margin.toFixed(0)}%`}
        </Text>
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
  totalLabel: { color: colors.textMuted, fontSize: 12 },
  totalValue: { color: colors.text, fontWeight: '700', fontSize: 16, marginTop: 2 },
  card: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  rank: {
    width: 26,
    color: colors.textFaint,
    fontSize: 13,
    fontWeight: '700',
  },
  name: { fontWeight: '600', fontSize: 15, color: colors.text },
  meta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  primary: { fontWeight: '700', fontSize: 15, color: colors.text },
  secondary: { color: colors.textFaint, fontSize: 11, marginTop: 1 },
});
