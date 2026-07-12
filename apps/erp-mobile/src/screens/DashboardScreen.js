import React from 'react';
import { ScrollView, View, Text, StyleSheet, RefreshControl } from 'react-native';
import { getKpis, getRevenueWindows } from '../api';
import { useLoad, errMessage } from '../useLoad';
import { Card, KpiTile, Loading, ErrorView, Row } from '../components/ui';
import { money, compact, qty } from '../format';
import { colors } from '../theme';

export default function DashboardScreen() {
  const { data, loading, refreshing, error, reload, refresh } = useLoad(async () => {
    const [kpis, rev] = await Promise.all([getKpis(), getRevenueWindows()]);
    return { kpis, rev };
  }, []);

  if (loading) return <Loading label="Loading dashboard…" />;
  if (error) return <ErrorView message={errMessage(error)} onRetry={reload} />;

  const { kpis, rev } = data;
  const grossProfit = Number(kpis.total_revenue || 0) - Number(kpis.total_cogs || 0);

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
    >
      <Text style={styles.section}>Today</Text>
      <View style={styles.gridRow}>
        <KpiTile label="Sales today" value={money(rev.today)} sub={`${qty(rev.todayCount)} invoices`} tone="pos" />
        <KpiTile label="Sales this month" value={compact(rev.month)} />
      </View>

      <Text style={styles.section}>All time</Text>
      <View style={styles.gridRow}>
        <KpiTile label="Revenue" value={compact(kpis.total_revenue)} />
        <KpiTile label="Gross profit" value={compact(grossProfit)} tone={grossProfit >= 0 ? 'pos' : 'neg'} />
      </View>
      <View style={styles.gridRow}>
        <KpiTile label="Receivable (A/R)" value={compact(kpis.ar_total)} tone="neg" />
        <KpiTile label="Payable (A/P)" value={compact(kpis.ap_total)} tone="neg" />
      </View>

      <Card>
        <Text style={styles.cardTitle}>Inventory</Text>
        <Row label="Stock value (at avg cost)" value={money(kpis.inventory_value)} />
        <Row label="Active items" value={qty(kpis.active_items)} />
        <Row
          label="Low-stock items"
          value={qty(kpis.low_stock_items)}
          tone={Number(kpis.low_stock_items) > 0 ? 'neg' : undefined}
        />
      </Card>

      <Card>
        <Text style={styles.cardTitle}>Activity</Text>
        <Row label="Sales (active)" value={qty(kpis.sales_count)} />
        <Row label="Purchases (active)" value={qty(kpis.purchases_count)} />
        <Row label="COGS (all time)" value={money(kpis.total_cogs)} />
      </Card>

      <Text style={styles.footnote}>Pull down to refresh · Read-only mirror of the shop database</Text>
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  section: {
    color: colors.textMuted,
    fontWeight: '700',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 16,
    marginHorizontal: 12,
    marginBottom: 2,
  },
  gridRow: { flexDirection: 'row', gap: 10, marginHorizontal: 12, marginTop: 10 },
  cardTitle: { fontWeight: '700', fontSize: 15, color: colors.text, marginBottom: 6 },
  footnote: { color: colors.textFaint, fontSize: 11, textAlign: 'center', marginTop: 18 },
});
