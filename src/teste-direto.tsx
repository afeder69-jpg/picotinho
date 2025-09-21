console.log('🚀 CRIANDO TESTE DIRETO SIMPLES...');

(window as any).testeDireto = async () => {
  console.log('🚀 INICIANDO TESTE DIRETO SIMPLES...');
  
  try {
    // Fazer uma chamada simples primeiro
    const response = await fetch('https://mjsbwrtegorjxcepvrik.functions.supabase.co/process-receipt-full', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('sb-mjsbwrtegorjxcepvrik-auth-token') || 'eyJhbGciOiJIUzI1NiIsImtpZCI6IjVCQXIveTRhRE5VMFkzTlMiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL21qc2J3cnRlZ29yanhjZXB2cmlrLnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiJhZTViNTUwMS03ZjhhLTQ2ZGEtOWNiYS1iOTk1NWE4NGU2OTciLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzU4NDE1NTY3LCJpYXQiOjE3NTg0MTE5NjcsImVtYWlsIjoiYS5mZWRlcjY5QGdtYWlsLmNvbSIsInBob25lIjoiIiwiYXBwX21ldGFkYXRhIjp7InByb3ZpZGVyIjoiZW1haWwiLCJwcm92aWRlcnMiOlsiZW1haWwiXX0sInVzZXJfbWV0YWRhdGEiOnsiZW1haWwiOiJhLmZlZGVyNjlAZ21haWwuY29tIiwiZW1haWxfdmVyaWZpZWQiOnRydWUsInBob25lX3ZlcmlmaWVkIjpmYWxzZSwic3ViIjoiYWU1YjU1MDEtN2Y4YS00NmRhLTljYmEtYjk5NTVhODRlNjk3In0sInJvbGUiOiJhdXRoZW50aWNhdGVkIiwiYWFsIjoiYWFsMSIsImFtciI6W3sibWV0aG9kIjoicGFzc3dvcmQiLCJ0aW1lc3RhbXAiOjE3NTc1Mzg0NTV9XSwic2Vzc2lvbl9pZCI6IjMzMGYxNGI3LTBhZmQtNDc1ZC05YjlmLTJjZDM2ODg1MWJiOSIsImlzX2Fub255bW91cyI6ZmFsc2V9.LCMDWk6NdKOwRgo3JJcB2loMXJPYL4OBgy42tZcLEII'}`,
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1qc2J3cnRlZ29yanhjZXB2cmlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1NzE5NTYsImV4cCI6MjA3MDE0Nzk1Nn0.Yn3Gdph30PzbiA31OqQgA9QvvCdDZbtXp89G7EoVkxg'
      },
      body: JSON.stringify({ imagemId: '43d91fa0-2382-4b9c-826b-615bd7ceff15' })
    });
    
    console.log('📡 Status da resposta:', response.status);
    console.log('📡 Headers da resposta:', Object.fromEntries(response.headers.entries()));
    
    const data = await response.json();
    console.log('📡 Dados da resposta:', data);
    
    return { success: true, status: response.status, data };
    
  } catch (error) {
    console.error('❌ ERRO na chamada direta:', error);
    return { success: false, error: error.message };
  }
};

console.log('✅ Função testeDireto() criada!');