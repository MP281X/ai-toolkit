import {Outlet, createFileRoute} from '@tanstack/react-router'

export const Route = createFileRoute('/(home)')({component: Outlet})
