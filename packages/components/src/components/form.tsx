import {Array, Number, Option, pipe} from 'effect'

import * as tanstackForm from '@tanstack/react-form'
import {useState} from 'react'

import {Button} from '#components/ui/button.tsx'
import {Checkbox} from '#components/ui/checkbox.tsx'
import {Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList} from '#components/ui/command.tsx'
import {Field, FieldError, FieldLabel} from '#components/ui/field.tsx'
import {Input} from '#components/ui/input.tsx'
import {Popover, PopoverContent, PopoverTrigger} from '#components/ui/popover.tsx'
import {toast} from '#components/ui/sonner.tsx'
import {Spinner} from '#components/ui/spinner.tsx'
import {Textarea} from '#components/ui/textarea.tsx'
import {cn, formatError, toSentenceCase} from '#lib/utils.ts'

const {fieldContext, formContext, useFieldContext, useFormContext} = tanstackForm.createFormHookContexts()

function FieldWrapper(props: {
	name: string
	isInvalid: boolean
	errors: {message?: string}[]
	children: React.ReactNode
}) {
	return (
		<Field data-invalid={props.isInvalid}>
			<FieldLabel htmlFor={props.name}>{toSentenceCase(props.name)}</FieldLabel>
			{props.children}
			{props.isInvalid && <FieldError errors={props.errors} />}
		</Field>
	)
}

function SubmitButton(props: {children: React.ReactNode}) {
	const form = useFormContext()

	return (
		<form.Subscribe
			selector={state => ({
				isSubmitting: state.isSubmitting,
				canSubmit: state.canSubmit
			})}
		>
			{state => (
				<Button type="submit" disabled={state.isSubmitting || !state.canSubmit}>
					{state.isSubmitting && <Spinner />}
					{props.children}
				</Button>
			)}
		</form.Subscribe>
	)
}

function CancelButton(props: {children: React.ReactNode; onClick: () => void}) {
	const form = useFormContext()

	return (
		<form.Subscribe selector={state => state.isSubmitting}>
			{isSubmitting => (
				<Button
					type="button"
					variant="destructive"
					disabled={isSubmitting}
					onClick={() => {
						props.onClick()
						form.reset()
					}}
				>
					{props.children}
				</Button>
			)}
		</form.Subscribe>
	)
}

function TextField() {
	const field = useFieldContext<string>()
	const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid

	return (
		<FieldWrapper name={field.name} isInvalid={isInvalid} errors={field.state.meta.errors}>
			<Input
				type="text"
				id={field.name}
				name={field.name}
				value={field.state.value}
				onBlur={field.handleBlur}
				onChange={event => field.handleChange(event.target.value)}
				autoComplete="off"
				aria-invalid={isInvalid}
			/>
		</FieldWrapper>
	)
}

function EmailField() {
	const field = useFieldContext<string>()
	const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid

	return (
		<FieldWrapper name={field.name} isInvalid={isInvalid} errors={field.state.meta.errors}>
			<Input
				type="email"
				id={field.name}
				name={field.name}
				value={field.state.value}
				onBlur={field.handleBlur}
				onChange={event => field.handleChange(event.target.value)}
				autoComplete="off"
				aria-invalid={isInvalid}
			/>
		</FieldWrapper>
	)
}

function PasswordField() {
	const field = useFieldContext<string>()
	const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid

	return (
		<FieldWrapper name={field.name} isInvalid={isInvalid} errors={field.state.meta.errors}>
			<Input
				type="password"
				id={field.name}
				name={field.name}
				value={field.state.value}
				onBlur={field.handleBlur}
				onChange={event => field.handleChange(event.target.value)}
				autoComplete="off"
				aria-invalid={isInvalid}
			/>
		</FieldWrapper>
	)
}

function TextAreaField() {
	const field = useFieldContext<string>()
	const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid

	return (
		<FieldWrapper name={field.name} isInvalid={isInvalid} errors={field.state.meta.errors}>
			<Textarea
				id={field.name}
				name={field.name}
				value={field.state.value}
				onBlur={field.handleBlur}
				onChange={event => field.handleChange(event.target.value)}
				autoComplete="off"
				aria-invalid={isInvalid}
			/>
		</FieldWrapper>
	)
}

function NumberField() {
	const field = useFieldContext<number>()
	const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid

	return (
		<FieldWrapper name={field.name} isInvalid={isInvalid} errors={field.state.meta.errors}>
			<Input
				type="number"
				id={field.name}
				name={field.name}
				value={field.state.value}
				onBlur={field.handleBlur}
				onChange={event => Option.map(Number.parse(event.target.value), field.handleChange)}
				autoComplete="off"
				aria-invalid={isInvalid}
			/>
		</FieldWrapper>
	)
}

function CheckboxField() {
	const field = useFieldContext<boolean>()
	const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid

	return (
		<FieldWrapper name={field.name} isInvalid={isInvalid} errors={field.state.meta.errors}>
			<div>
				<Checkbox
					id={field.name}
					checked={field.state.value}
					onBlur={field.handleBlur}
					onCheckedChange={value => field.handleChange(value === true)}
					aria-invalid={isInvalid}
				/>
			</div>
		</FieldWrapper>
	)
}

function FileField() {
	const field = useFieldContext<File>()
	const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid

	return (
		<FieldWrapper name={field.name} isInvalid={isInvalid} errors={field.state.meta.errors}>
			<Input
				type="file"
				id={field.name}
				onChange={event => {
					const file = event.target.files?.[0]
					if (file) field.handleChange(file)
				}}
				aria-invalid={isInvalid}
			/>
		</FieldWrapper>
	)
}

function ComboboxField<TOption extends {id: string}>(props: {
	options: TOption[]
	children: (option: TOption) => React.ReactNode
}) {
	const field = useFieldContext<string>()
	const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
	const [open, setOpen] = useState(false)

	const selectedOption = pipe(
		props.options,
		Array.findFirst(option => option.id === field.state.value),
		Option.getOrUndefined
	)

	return (
		<FieldWrapper name={field.name} isInvalid={isInvalid} errors={field.state.meta.errors}>
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger
					render={
						<Button
							variant="outline"
							role="combobox"
							className={cn('w-full justify-between', !field.state.value && 'text-muted-foreground')}
						/>
					}
				>
					{selectedOption ? props.children(selectedOption) : toSentenceCase(field.name)}
				</PopoverTrigger>
				<PopoverContent className="w-(--radix-popover-trigger-width) p-0">
					<Command>
						<CommandInput placeholder={`Search ${toSentenceCase(field.name)}...`} />
						<CommandList>
							<CommandEmpty>No {toSentenceCase(field.name)} found.</CommandEmpty>
							<CommandGroup>
								{pipe(
									props.options,
									Array.map(option => (
										<CommandItem
											key={option.id}
											value={option.id}
											onSelect={() => {
												field.handleChange(option.id)
												setOpen(false)
											}}
										>
											{props.children(option)}
										</CommandItem>
									))
								)}
							</CommandGroup>
						</CommandList>
					</Command>
				</PopoverContent>
			</Popover>
		</FieldWrapper>
	)
}

const formHook = tanstackForm.createFormHook({
	fieldContext,
	formContext,
	fieldComponents: {
		TextField,
		TextAreaField,
		EmailField,
		PasswordField,
		NumberField,
		CheckboxField,
		FileField,
		ComboboxField
	},
	formComponents: {SubmitButton, CancelButton}
})

export const useForm = formHook.useAppForm
export const revalidateLogic = tanstackForm.revalidateLogic

export {useFieldContext, useFormContext}

export declare namespace Form {
	export type Props = {
		form: {
			handleSubmit: () => Promise<void>
			reset: () => void
			AppForm: React.ComponentType<{children?: React.ReactNode}>
		}
		className?: string
		children: React.ReactNode
	}
}

export function Form(props: Form.Props) {
	return (
		<props.form.AppForm>
			<form
				className={cn('flex flex-1 items-center justify-center', props.className)}
				onSubmit={async event => {
					event.preventDefault()
					try {
						await props.form.handleSubmit()
						props.form.reset()
					} catch (error) {
						toast.error(formatError(error))
					}
				}}
			>
				{props.children}
			</form>
		</props.form.AppForm>
	)
}
