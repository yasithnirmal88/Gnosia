import ShaderBackground from '@/components/ui/shader-background-1'

export default function ShaderDemo() {
  return (
    <div className="app-container">
      <ShaderBackground
        className="shader-wrapper"
        speed={1}
        mouseEnable={true}
      />
    </div>
  )
}
