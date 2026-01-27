import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { X, Keyboard, CheckCircle2, AlertCircle } from 'lucide-react';
import { validarChaveAcesso, formatarChaveVisual } from '@/lib/documentDetection';

interface ManualKeyInputProps {
  onSubmit: (chaveAcesso: string) => void;
  onClose: () => void;
}

const ManualKeyInput = ({ onSubmit, onClose }: ManualKeyInputProps) => {
  const [chave, setChave] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [isValid, setIsValid] = useState(false);

  // Limpar apenas dígitos
  const chaveNumeros = chave.replace(/\D/g, '');
  const digitosCount = chaveNumeros.length;
  const progress = (digitosCount / 44) * 100;

  useEffect(() => {
    if (digitosCount === 44) {
      const validacao = validarChaveAcesso(chaveNumeros);
      setIsValid(validacao.valida);
      setErro(validacao.erro || null);
    } else {
      setIsValid(false);
      setErro(null);
    }
  }, [chaveNumeros, digitosCount]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Aceitar apenas dígitos e limitar a 44
    const valor = e.target.value.replace(/\D/g, '').slice(0, 44);
    setChave(valor);
  };

  const handleSubmit = () => {
    if (isValid) {
      // Feedback háptico
      if (navigator.vibrate) {
        navigator.vibrate([100, 50, 100]);
      }
      onSubmit(chaveNumeros);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text');
    const numeros = pastedText.replace(/\D/g, '').slice(0, 44);
    setChave(numeros);
  };

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-background">
      {/* Header */}
      <div className="relative z-10 w-full flex justify-between items-center p-4 border-b">
        <div className="flex items-center gap-2">
          <Keyboard className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">Digitar Chave de Acesso</h2>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
        >
          <X className="w-5 h-5" />
        </Button>
      </div>

      {/* Conteúdo */}
      <div className="flex-1 flex flex-col p-6 gap-6 overflow-auto">
        {/* Instruções */}
        <div className="bg-muted/50 p-4 rounded-lg">
          <p className="text-sm text-muted-foreground">
            A chave de acesso de <strong>44 dígitos</strong> está impressa no cupom fiscal, 
            geralmente no <strong>topo</strong> ou <strong>rodapé</strong> do documento.
          </p>
        </div>

        {/* Input */}
        <div className="space-y-3">
          <Label htmlFor="chave-acesso">Chave de Acesso</Label>
          <Input
            id="chave-acesso"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="Digite os 44 dígitos..."
            value={formatarChaveVisual(chave)}
            onChange={handleInputChange}
            onPaste={handlePaste}
            className="text-lg font-mono tracking-wider h-14"
            autoFocus
            autoComplete="off"
          />
          
          {/* Barra de progresso */}
          <div className="space-y-2">
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all duration-300 ${
                  isValid ? 'bg-green-500' : erro ? 'bg-destructive' : 'bg-primary'
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
            
            {/* Status */}
            <div className="flex items-center justify-between text-sm">
              <span className={`flex items-center gap-1 ${
                isValid ? 'text-green-600' : erro ? 'text-destructive' : 'text-muted-foreground'
              }`}>
                {isValid ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Chave válida
                  </>
                ) : erro ? (
                  <>
                    <AlertCircle className="w-4 h-4" />
                    {erro}
                  </>
                ) : (
                  `${digitosCount}/44 dígitos`
                )}
              </span>
              
              {digitosCount > 0 && digitosCount < 44 && (
                <span className="text-muted-foreground">
                  Faltam {44 - digitosCount}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Dica de cola */}
        <div className="text-xs text-muted-foreground text-center">
          💡 Dica: Você pode <strong>colar</strong> a chave copiada de outro lugar
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t bg-background">
        <Button
          className="w-full h-14 text-lg"
          size="lg"
          disabled={!isValid}
          onClick={handleSubmit}
        >
          {isValid ? '✓ Processar Nota' : 'Digite os 44 dígitos'}
        </Button>
      </div>
    </div>
  );
};

export default ManualKeyInput;
