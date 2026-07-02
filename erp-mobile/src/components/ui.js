import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  Pressable,
  ScrollView,
} from 'react-native';
import { colors } from '../theme';

export function Card({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function KpiTile({ label, value, sub, tone }) {
  const valColor =
    tone === 'pos' ? colors.positive : tone === 'neg' ? colors.negative : colors.text;
  return (
    <View style={styles.kpi}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={[styles.kpiValue, { color: valColor }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {sub ? <Text style={styles.kpiSub}>{sub}</Text> : null}
    </View>
  );
}

export function Loading({ label }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.primary} />
      {label ? <Text style={styles.muted}>{label}</Text> : null}
    </View>
  );
}

export function ErrorView({ message, onRetry }) {
  return (
    <View style={styles.center}>
      <Text style={styles.errTitle}>Couldn't load data</Text>
      <Text style={styles.muted}>{message}</Text>
      {onRetry ? (
        <Pressable style={styles.btn} onPress={onRetry}>
          <Text style={styles.btnText}>Retry</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Empty({ message }) {
  return (
    <View style={styles.center}>
      <Text style={styles.muted}>{message}</Text>
    </View>
  );
}

export function SearchBar({ value, onChangeText, placeholder }) {
  return (
    <TextInput
      style={styles.search}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.textFaint}
      autoCapitalize="none"
      autoCorrect={false}
      clearButtonMode="while-editing"
    />
  );
}

export function Segmented({ options, value, onChange }) {
  return (
    <View style={styles.segWrap}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            style={[styles.seg, active && styles.segActive]}
            onPress={() => onChange(opt.value)}
          >
            <Text style={[styles.segText, active && styles.segTextActive]}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// A labelled key/value row used inside cards.
export function Row({ label, value, tone }) {
  const c = tone === 'pos' ? colors.positive : tone === 'neg' ? colors.negative : colors.text;
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, { color: c }]}>{value}</Text>
    </View>
  );
}

export function Badge({ text, tone }) {
  const bg =
    tone === 'neg' ? '#fde7e9' : tone === 'warn' ? '#fff4ce' : tone === 'pos' ? '#dff6dd' : '#eaeaea';
  const fg =
    tone === 'neg' ? colors.negative : tone === 'warn' ? colors.warn : tone === 'pos' ? colors.positive : colors.textMuted;
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.badgeText, { color: fg }]}>{text}</Text>
    </View>
  );
}

export const layout = { ScrollView };

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginHorizontal: 12,
    marginTop: 10,
  },
  kpi: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    flex: 1,
    minHeight: 78,
    justifyContent: 'center',
  },
  kpiLabel: { color: colors.textMuted, fontSize: 12, marginBottom: 4 },
  kpiValue: { fontSize: 20, fontWeight: '700' },
  kpiSub: { color: colors.textFaint, fontSize: 11, marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  muted: { color: colors.textMuted, marginTop: 8, textAlign: 'center' },
  errTitle: { color: colors.negative, fontWeight: '700', fontSize: 16 },
  btn: { marginTop: 16, backgroundColor: colors.primary, paddingHorizontal: 20, paddingVertical: 10 },
  btnText: { color: '#fff', fontWeight: '600' },
  search: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingHorizontal: 12,
    paddingVertical: 10,
    margin: 12,
    marginBottom: 0,
    color: colors.text,
    fontSize: 15,
  },
  segWrap: {
    flexDirection: 'row',
    marginHorizontal: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  seg: { flex: 1, paddingVertical: 10, alignItems: 'center', backgroundColor: colors.surface },
  segActive: { backgroundColor: colors.primary },
  segText: { color: colors.textMuted, fontWeight: '600' },
  segTextActive: { color: '#fff' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3,
  },
  rowLabel: { color: colors.textMuted, fontSize: 13 },
  rowValue: { color: colors.text, fontSize: 13, fontWeight: '600' },
  badge: { paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start' },
  badgeText: { fontSize: 11, fontWeight: '700' },
});
