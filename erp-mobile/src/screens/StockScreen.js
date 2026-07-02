import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, Pressable } from 'react-native';
import { getStock } from '../api';
import { useLoad, errMessage } from '../useLoad';
import { Loading, ErrorView, Empty, SearchBar, Badge } from '../components/ui';
import { money, qty } from '../format';
import { colors } from '../theme';

export default function StockScreen() {
  const [search, setSearch] = useState('');
  const [lowOnly, setLowOnly] = useState(false);

  const { data, loading, refreshing, error, reload, refresh } = useLoad(
    () => getStock({ search, lowOnly }),
    [search, lowOnly],
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SearchBar value={search} onChangeText={setSearch} placeholder="Search name, SKU, barcode, model…" />
      <View style={styles.filterRow}>
        <Pressable
          style={[styles.chip, lowOnly && styles.chipActive]}
          onPress={() => setLowOnly((v) => !v)}
        >
          <Text style={[styles.chipText, lowOnly && styles.chipTextActive]}>Low stock only</Text>
        </Pressable>
        {data ? <Text style={styles.count}>{data.length} item(s)</Text> : null}
      </View>

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorView message={errMessage(error)} onRetry={reload} />
      ) : (data || []).length === 0 ? (
        <Empty message="No items found." />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(it) => it.item_id}
          contentContainerStyle={{ paddingBottom: 24, paddingTop: 2 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
          renderItem={({ item }) => <StockRow item={item} />}
        />
      )}
    </View>
  );
}

function StockRow({ item }) {
  const onHand = Number(item.on_hand || 0);
  const reserved = Number(item.reserved_qty || 0);
  return (
    <View style={styles.card}>
      <View style={styles.headRow}>
        <Text style={styles.name} numberOfLines={2}>{item.name}</Text>
        <Text style={[styles.onHand, onHand <= 0 && { color: colors.negative }]}>{qty(onHand)}</Text>
      </View>
      <View style={styles.metaRow}>
        <Text style={styles.meta}>{item.sku}{item.brand ? ` · ${item.brand}` : ''}</Text>
        <Text style={styles.unit}>{item.unit}</Text>
      </View>
      <View style={styles.badges}>
        {item.low_stock ? <Badge text="LOW" tone="neg" /> : null}
        {reserved > 0 ? <Badge text={`${qty(reserved)} reserved`} tone="warn" /> : null}
        <Badge text={`Avail ${qty(item.available)}`} />
        <Badge text={`Val ${money(item.inventory_value)}`} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 12,
    marginTop: 10,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textMuted, fontWeight: '600', fontSize: 13 },
  chipTextActive: { color: '#fff' },
  count: { color: colors.textMuted, fontSize: 13 },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginHorizontal: 12,
    marginTop: 10,
  },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  name: { flex: 1, fontWeight: '600', fontSize: 15, color: colors.text, paddingRight: 10 },
  onHand: { fontWeight: '700', fontSize: 20, color: colors.text },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  meta: { color: colors.textMuted, fontSize: 12, flex: 1 },
  unit: { color: colors.textFaint, fontSize: 12 },
  badges: { flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' },
});
