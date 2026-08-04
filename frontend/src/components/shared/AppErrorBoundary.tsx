import { Component, type ErrorInfo, type ReactNode } from 'react';
import { reportClientError } from '@/lib/clientErrorReporter';

type Props = { children: ReactNode };
type State = { error: Error | null };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    reportClientError(error, { source: 'react-error-boundary', componentStack: info.componentStack ?? undefined });
  }

  private retry = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6">
        <section className="w-full max-w-lg rounded-lg border border-amber-400/50 bg-card p-6 shadow-sm" role="alert">
          <h1 className="text-lg font-semibold">Не удалось отобразить страницу</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Произошла ошибка интерфейса. Она сохранена в журнале диагностики; попробуйте повторить операцию.
          </p>
          <p className="mt-3 rounded bg-muted p-2 font-mono text-xs break-words">{this.state.error.message}</p>
          <button type="button" onClick={this.retry} className="mt-4 rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground">
            Повторить
          </button>
        </section>
      </main>
    );
  }
}
