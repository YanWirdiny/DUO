"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { formatFriendly } from "@/lib/dates";

export type ProgressPoint = { date: string; weight: number };

/** Line chart of an exercise's logged weight over time, with its all-time PR badge. */
export function ExerciseProgressCard({
  name,
  points,
  prWeight,
}: {
  name: string;
  points: ProgressPoint[];
  prWeight: number;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-text">{name}</CardTitle>
        <Badge tone="accent">PR {prWeight}</Badge>
      </CardHeader>

      <div className="h-40 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
            <XAxis
              dataKey="date"
              tickFormatter={(d) => formatFriendly(d).replace(/^\w+,\s/, "")}
              tick={{ fontSize: 11, fill: "var(--color-text-faint)" }}
              tickLine={false}
              axisLine={{ stroke: "var(--color-border)" }}
              minTickGap={30}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--color-text-faint)" }}
              tickLine={false}
              axisLine={false}
              width={36}
            />
            <Tooltip
              cursor={{ stroke: "var(--color-border)", strokeWidth: 1 }}
              contentStyle={{
                background: "var(--color-surface-raised)",
                border: "1px solid var(--color-border)",
                borderRadius: 12,
                fontSize: 12,
              }}
              labelFormatter={(d) => formatFriendly(String(d))}
              formatter={(value) => [`${value}`, "Weight"]}
            />
            <Line
              type="monotone"
              dataKey="weight"
              stroke="var(--color-accent)"
              strokeWidth={2}
              dot={{ r: 3, fill: "var(--color-accent)", strokeWidth: 0 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
