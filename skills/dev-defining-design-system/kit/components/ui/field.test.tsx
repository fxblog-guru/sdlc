import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ErrorSummary, Field } from './field';
import { Input } from './input';
import { Textarea } from './textarea';
import { Select } from './select';
import { Checkbox } from './checkbox';

describe('Field wiring', () => {
  it('labels the control, and describes it by the error then the hint', () => {
    render(
      <Field label="Name" hint="Shown to your team" error="Enter a name" required>
        <Input />
      </Field>,
    );
    const input = screen.getByRole('textbox', { name: /Name/ });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toBeRequired();
    expect(input).toHaveAccessibleDescription('Enter a name Shown to your team');
  });

  it('Textarea, Select and Checkbox take the same wiring', () => {
    render(
      <>
        <Field label="Notes" error="Too long">
          <Textarea />
        </Field>
        <Field label="Role">
          <Select options={[{ value: 'a', label: 'Admin' }]} />
        </Field>
        <Checkbox label="Notify me" />
      </>,
    );
    expect(screen.getByRole('textbox', { name: 'Notes' })).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('combobox', { name: 'Role' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Notify me' })).toBeInTheDocument();
  });
});

describe('ErrorSummary', () => {
  it('is an alert that takes focus and links to each field, with a plural title', () => {
    render(<ErrorSummary errors={{ name: 'Enter a name', email: 'Enter an e-mail address' }} labels={{ name: 'Name' }} />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveFocus();
    expect(alert).toHaveTextContent('There are 2 problems with this form.');
    expect(screen.getByRole('link', { name: 'Name: Enter a name' })).toHaveAttribute('href', '#name');
  });

  it('renders nothing without errors', () => {
    const { container } = render(<ErrorSummary errors={{}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
