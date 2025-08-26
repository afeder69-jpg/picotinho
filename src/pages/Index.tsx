import BottomNavigation from "@/components/BottomNavigation";

const Index = () => {
  // LOGS SUPER VISÍVEIS
  console.log("🔥🔥🔥 VERSÃO TOTALMENTE NOVA! 🔥🔥🔥", new Date().toISOString());
  console.log("🚨 SE VOCÊ VÊ ISSO, A VERSÃO ATUALIZOU! 🚨");
  console.log("📱 TIMESTAMP:", Date.now());
  
  return (
    <div className="min-h-screen bg-red-500 flex flex-col">
      {/* TELA COMPLETAMENTE VERMELHA - IMPOSSÍVEL NÃO VER */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="text-8xl mb-8 animate-bounce">🔥</div>
          
          <h1 className="text-6xl font-black text-white mb-8 animate-pulse shadow-2xl">
            VERSÃO NOVA!
          </h1>
          
          <div className="bg-black text-yellow-400 p-8 rounded-xl mb-6 text-3xl font-bold animate-ping">
            ⚡ ATUALIZOU! ⚡
          </div>
          
          <div className="text-white text-2xl font-bold mb-4">
            Hora: {new Date().toLocaleTimeString('pt-BR')}
          </div>
          
          <div className="text-white text-xl">
            Se esta tela está VERMELHA, funcionou!
          </div>
        </div>
      </div>
      
      <BottomNavigation />
      <div className="h-20"></div>
    </div>
  );
};

export default Index;
