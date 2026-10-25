// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import App from './App'

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '#/')
  document.documentElement.lang = 'en'
})

describe('sponsor portal v1 language setting', () => {
  it('hides the language dropdown, keeps the page in English, and retains display controls', () => {
    render(<App />)

    expect(screen.queryByLabelText('Language')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Open the private link from your email' })).toBeTruthy()
    expect(document.documentElement.lang).toBe('en')
    expect(screen.getByRole('button', { name: 'Smaller text' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Larger text' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Switch to dark mode' })).toBeTruthy()
  })
})
