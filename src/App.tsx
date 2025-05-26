import { Button, Card, CardContent, Typography, Box } from "@mui/material";
import MicIcon from "@mui/icons-material/Mic";

function App() {
  return (
    <Box sx={{ p: 3 }}>
      <Card>
        <CardContent>
          <Typography variant="h4" component="h1" gutterBottom>
            음성 비서
          </Typography>
          <Button variant="contained" startIcon={<MicIcon />} size="large">
            음성 인식 시작
          </Button>
        </CardContent>
      </Card>
    </Box>
  );
}

export default App;
