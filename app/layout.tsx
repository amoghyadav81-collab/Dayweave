import type {Metadata} from 'next';import './globals.css';
export const metadata:Metadata={title:'Dayweave — Make room for your day',description:'Your AI plans. You live. A calm daily planner with an authenticated MCP connection.',icons:{icon:'/favicon.svg'},robots:{index:false,follow:false}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
