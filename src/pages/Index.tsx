import BottomNavigation from "@/components/BottomNavigation";

const Index = () => {
  console.log("🚀 VERSÃO MEGA VISÍVEL! 🚀", new Date().toISOString());
  console.log("📱 TIMESTAMP NOVO:", Date.now());
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 to-pink-600 flex flex-col">
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="text-8xl mb-6 animate-bounce">🚀</div>
          
          <h1 className="text-4xl font-black text-white mb-6 animate-pulse">
            NOVA VERSÃO!
          </h1>
          
          <div className="bg-yellow-400 text-black p-4 rounded-xl mb-4 text-xl font-bold animate-ping">
            ⚡ FUNCIONOU! ⚡
          </div>
          
          <div className="text-white text-lg font-semibold mb-4">
            {new Date().toLocaleTimeString('pt-BR')}
          </div>
          
          <div className="w-20 h-20 bg-white rounded-full animate-spin mx-auto mb-4"></div>
          
          <div className="text-white text-base">
            Se você vê este foguete roxo, atualizou!
          </div>
        </div>
      </div>
      
      <BottomNavigation />
      <div className="h-20"></div>
    </div>
  );
};

export default Index;
