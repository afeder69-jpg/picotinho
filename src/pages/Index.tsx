import BottomNavigation from "@/components/BottomNavigation";

const Index = () => {
  return (
    <div className="min-h-screen bg-gradient-subtle flex flex-col">
      {/* Main content area */}
      <div className="flex-1 flex items-center justify-center pt-16 px-6">
        <div className="text-center max-w-md mx-auto relative">
          <h1 className="text-2xl font-bold text-foreground leading-tight mb-8">
            Bem-vindo ao Picotinho, a sua rede compartilhada de preços
          </h1>
          
          {/* Bolinha de teste - VERDE NEON desta vez */}
          <div className="w-24 h-24 bg-green-400 rounded-full mx-auto animate-spin shadow-2xl border-8 border-yellow-300"></div>
          <p className="text-xl font-bold text-green-400 mt-4 bg-black p-2 rounded">🟢 NOVA VERSÃO - VERDE NEON 🟢</p>
          <p className="text-sm text-foreground mt-2">Se você vê isso, a atualização funcionou!</p>
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
