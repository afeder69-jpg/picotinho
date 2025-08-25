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
          
          {/* Bolinha de teste - VERMELHA desta vez */}
          <div className="w-20 h-20 bg-red-600 rounded-full mx-auto animate-bounce shadow-2xl border-4 border-white"></div>
          <p className="text-lg font-bold text-red-600 mt-4">TESTE - Bolinha Vermelha</p>
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
