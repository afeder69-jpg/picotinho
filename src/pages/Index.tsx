import BottomNavigation from "@/components/BottomNavigation";

const Index = () => {
  // LOG PARA DEBUG
  console.log("🚀 NOVA VERSÃO CARREGANDO!", new Date().toISOString());
  console.log("🎯 Este é o código MAIS NOVO!");
  return (
    <div className="min-h-screen bg-gradient-subtle flex flex-col">
      {/* Main content area */}
      <div className="flex-1 flex items-center justify-center pt-16 px-6">
        <div className="text-center max-w-md mx-auto relative">
          <h1 className="text-6xl font-bold text-purple-500 leading-tight mb-8 animate-pulse">
            ⭐ VERSÃO FINAL TESTE ⭐
          </h1>
          
          {/* GRANDE CÍRCULO ROXO QUE VOCÊ DEVE VER */}
          <div className="w-48 h-48 bg-purple-600 rounded-full mx-auto animate-spin shadow-2xl border-8 border-yellow-400 mb-6 flex items-center justify-center">
            <span className="text-4xl text-white font-bold">NOVO!</span>
          </div>
          
          <div className="bg-purple-600 text-white p-8 rounded-lg font-bold text-2xl animate-bounce mb-4">
            🎯 CÍRCULO ROXO GIGANTE 🎯
          </div>
          
          <div className="bg-yellow-400 text-black p-4 rounded-lg font-bold text-lg">
            {new Date().toLocaleString('pt-BR')} - TIMESTAMP ATUAL
          </div>
          
          <p className="text-xl text-foreground mt-4 font-bold">
            Se você vê o círculo roxo gigante, funcionou!
          </p>
        </div>
      </div>
      
      {/* Bottom navigation */}
      <BottomNavigation />
      
      {/* Spacer for fixed bottom navigation */}
      <div className="h-20"></div>
    </div>
  );
};

export default Index;
