import BottomNavigation from "@/components/BottomNavigation";

const Index = () => {
  console.log("🔵 VERSÃO BOLINHA AZUL! 🔵", new Date().toISOString());
  
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="flex-1 flex items-center justify-center">
        <div className="w-20 h-20 bg-blue-500 rounded-full animate-pulse"></div>
      </div>
      
      <BottomNavigation />
      <div className="h-20"></div>
    </div>
  );
};

export default Index;
