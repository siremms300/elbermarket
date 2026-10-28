import { Text, type TextProps } from "./Text";

// Numeric display component. Renders money, distances, quantities with
// tabular figures so digits align in lists.
//
// Example:
//   <Numeric value="1,234,567.00" currency="NGN" />
//   <Numeric value="628.9" unit="km" variant="numericSmall" />

interface NumericProps extends Omit<TextProps, "children"> {
  value: string | number;
  currency?: string;
  unit?: string;
  variant?: "numericDisplay" | "numeric" | "numericSmall";
}

export function Numeric({
  value,
  currency,
  unit,
  variant = "numeric",
  color,
  ...rest
}: NumericProps) {
  const displayValue = typeof value === "number" ? formatNumber(value) : value;

  return (
    <Text variant={variant} color={color} {...rest}>
      {currency ? `${currency} ${displayValue}` : displayValue}
      {unit ? ` ${unit}` : ""}
    </Text>
  );
}

function formatNumber(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}