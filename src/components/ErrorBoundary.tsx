import { Component, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
}

/** Evita que un error de render deje la app en blanco: muestra un aviso
 *  con opción de recargar en lugar de desmontar todo. */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('Render error:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="mx-auto max-w-sm px-4 pt-24 text-center">
          <div className="card flex flex-col items-center gap-3 p-8">
            <AlertTriangle className="h-8 w-8 text-amber-400" />
            <h1 className="font-display text-lg font-bold text-white">Algo ha ido mal</h1>
            <p className="text-sm text-zinc-400">
              Ha ocurrido un error al mostrar esta pantalla. Vuelve a cargar la página.
            </p>
            <button onClick={() => window.location.reload()} className="btn-primary mt-1">
              Recargar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
