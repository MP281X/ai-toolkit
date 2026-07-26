'use client'

import {CircleCheckIcon, InfoIcon, OctagonXIcon, TriangleAlertIcon} from 'lucide-react'
import type * as React from 'react'
import * as Sonner from 'sonner'
import type {ToasterProps} from 'sonner'

import {Spinner} from '#components/ui/spinner.tsx'
export function Toaster(input: ToasterProps) {
	const props = input
	return (
		<Sonner.Toaster
			theme="system"
			className="toaster group"
			icons={{
				error: <OctagonXIcon className="size-4" />,
				info: <InfoIcon className="size-4" />,
				loading: <Spinner className="size-4" />,
				success: <CircleCheckIcon className="size-4" />,
				warning: <TriangleAlertIcon className="size-4" />
			}}
			style={
				{
					'--border-radius': 'var(--radius)',
					'--normal-bg': 'var(--popover)',
					'--normal-border': 'var(--border)',
					'--normal-text': 'var(--popover-foreground)'
				} satisfies React.CSSProperties
			}
			toastOptions={{classNames: {toast: 'cn-toast'}}}
			{...props}
		/>
	)
}
export {toast} from 'sonner'
