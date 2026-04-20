export const APP_VERSION = "1.4";

/**
 * Janela de tempo (em minutos) usada pelo indicador global de processamento
 * para considerar uma nota "em processamento real".
 *
 * Notas com status `aguardando_estoque`/`processando` mais antigas que essa janela
 * são tratadas como resíduo de sessões anteriores e NÃO acionam o badge global
 * (continuam visíveis individualmente em "Minhas Notas").
 *
 * Centralizado aqui para facilitar ajustes futuros conforme o comportamento real
 * em produção.
 */
export const PROCESSING_INDICATOR_WINDOW_MINUTES = 30;

/** Polling de segurança (ms) para reconciliar o indicador global caso o realtime falhe. */
export const PROCESSING_INDICATOR_POLL_MS = 10_000;
