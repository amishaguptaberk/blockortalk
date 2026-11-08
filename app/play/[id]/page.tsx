import { CallScreen } from './CallScreen';
import '../play.css';
export default async function CallPage({params}:{params:Promise<{id:string}>}){const {id}=await params;return <CallScreen scenarioId={id}/>;}
