"use client";
import dynamic from "next/dynamic";
import type { CSSProperties, ReactElement } from "react";

const ReactECharts: any = dynamic(() => import("echarts-for-react"), { ssr: false });

export function Chart({ option, className, style }: { option: any; className?: string; style?: CSSProperties }): ReactElement {
  return <ReactECharts option={option} className={className} style={style} notMerge lazyUpdate />;
}


